var request = require('request').defaults({ encoding: null });
var fs = require('fs');
var jsonfile = require('jsonfile');
var moment = require('moment');
var Jimp = require('jimp');
var Twit = require('twit');
var Converter = require("csvtojson").Converter;
var twitterConfig = require('./twitter-config');

console.log(Date());
var Bot = new Twit(twitterConfig);
var csv = new Converter({});

var obj = JSON.parse(fs.readFileSync(__dirname + '/ghgga-index.json', 'utf8') || '{}');
var index = obj.index || 0;

csv.fromFile(__dirname + '/ghgga.csv', function(err,csvFile) {

  index++;
  var record = csvFile[index];

  var count = record['GHG QUANTITY (METRIC TONS CO2e)'];
  var status = '[' + record['GHGRP ID'] + '] ' + record['PARENT COMPANIES'] + ' ::: ' + record['FACILITY NAME'] + ' :: ' + count + ' : ' + record['SUBPARTS'];
  console.log(status);
  // post to twitter
  var location = record['LATITUDE'] + ',' + record['LONGITUDE'];
  request.get('https://maps.googleapis.com/maps/api/staticmap?maptype=satellite&zoom=15&size=640x400&center=' + location, function (error, response, imageBuffer) {
    if (error) console.error('error getting sattelite image', error);
    Jimp.read(new Buffer(imageBuffer))
    .then(function(image) {
      image.write('original.jpg')
      if (count === 0) {
        // don't do anything to image
      } else if (count < 10000) {
        factor = ((count*count) / (10000*10000)) * 4;
        // use Jimp.RESIZE_NEAREST_NEIGHBOR algorithm for mosaic/pixelate effect
        image.scale(1 / (factor), Jimp.RESIZE_NEAREST_NEIGHBOR);
        image.scale(factor, Jimp.RESIZE_NEAREST_NEIGHBOR);
      } else {
        image.scale(1 / 4, Jimp.RESIZE_NEAREST_NEIGHBOR);
        image.scale(4, Jimp.RESIZE_NEAREST_NEIGHBOR);
        if (count < 80000) {
          image.posterize(50 - ((count - 10000) / 70000) * 42);
        } else {
          image.posterize(8);
          var remaining = count - 150000;
          var probability = remaining / 900000;
          if (probability > 0.8) probability = 0.8;
          var j = 0;
          for (var i = 0; i < image.bitmap.width; i++) {
            if (Math.random() < probability) {
              j++;
              image.scan(i, 0, 1, image.bitmap.height, function(x, y, idx) {
                image.setPixelColor(0x000000, x, y);
              });
            }
          }
          console.log(j + ' lines removed');
        }
      }

      image.getBuffer(Jimp.MIME_JPEG, function(err, buffer) {
        Bot.post('media/upload', { media_data: new Buffer(buffer).toString('base64') }, function (err, data, response) {
          if (err) console.error('error uploading image', err);
          // now we can assign alt text to the media, for use by screen readers and 
          // other text-based presentations and interpreters 
          var mediaIdStr = data.media_id_string
          var meta_params = { media_id: mediaIdStr }
        

          Bot.post('media/metadata/create', meta_params, function (err, data, response) {
            if (err) {
              console.error('error creating metadata', err);
            } else {
              // now we can reference the media and post a tweet (media will attach to the tweet) 
              var params = { status: status, media_ids: [mediaIdStr] }
         
              Bot.post('statuses/update', params, function (err, data, response) {
                console.log('done tweeting');
              });
            }
          });
        })
      });
    });
  });


  // save csv index
  jsonfile.writeFile(__dirname + '/ghgga-index.json', { 'index': index }, { spaces: 2 }, function(err) {
    if (err) console.error('error saving index', err);
  });
});