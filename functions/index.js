/* eslint no-unused-vars: "warn" */
// disabled temporary because we have so much unused variables
// but should be fixed soon

'use strict';
// Bimlendra

// FIXME: this version of actions-on-google has bug:
//
// it overwrites process.env.DEBUG
//
// file  node_modules/actions-on-google/utils/transform.js
//
// // Enable actions-on-google debug logging
// process.env.DEBUG = 'actions-on-google:*';
//
const storeDEBUG = process.env.DEBUG;
const DialogflowApp = require('actions-on-google').DialogflowApp;
process.env.DEBUG = storeDEBUG;

const bst = require('bespoken-tools');
const dashbot = require('dashbot')('54mlQ1bEx6WFGlU4A27yHZubsQXvMwYPAqHtxJYg').google;
const debug = require('debug')('ia:index:debug');
debug.log = console.log.bind(console);
const functions = require('firebase-functions');
const https = require('https');
const http = require('http');
const replaceall = require('replaceall');
const util = require('util');

const actions = require('./actions/names');
const {getLastAction, storeAction, getLastRepetitionCount} = require('./state/repetition');
const strings = require('./strings');

// let logless = bst.Logless.middleware("54bcfb2a-a12b-4c6a-8729-a4ad71c06975");

let ARCHIVE_HOST = 'web.archive.org';
let imageURL = 'https://archive.org/services/img/';
let podcastAPIURL = '/advancedsearch.php?q=collection:';
let podcastCityAPIURL = '/advancedsearch.php?q=collection:';
let podcastAPIURLNEW = '/advancedsearch.php?q=';
let SeventyEightsAPIURL = '/advancedsearch.php?q=collection:(georgeblood)+AND+subject:';
let APIURLIdentifier = '/metadata/';
let playlist = [];

let currentSearchPage = 1;
let currentTrackIdx = 0;
let audioURL;
let searchByYear = '';
let invalidSearchPage = false;
let searchByTitle = false;
let playAudioByRandomYear = false;
let playAudioByRandomCity = false;
let playAudioByRandom = false;
let searchByCity = '';
let availableCity = 'Los Angeles';
let availableYear = '1971';
let strange_variable_used = true;
let searchByCollectionValue = '';
let collectionQuery = '';
let searchByTrackTitle = '';
let APIURL = '';
let searchForSeventyEights = false;
let oneGoPlayAudio = false;
let oneGoCollectionRandomPlayAudio = false;
let topicName = '';
let totalTrackNumber = -1;
let strange_variable_IdentifierCount = 0;

let currentSpeechoutput = -1;
let currentSuggestions = null;
let currentRepromptText = null;

let previousSpeechoutput = -1;
let previousSuggestions = null;

let availableYears = [];

debug('[Start]');
debug('-----------------------------------------');
debug('Environment:');
debug(`Node.js Version: ${process.version}`);
debug('-----------------------------------------');

const LIST_FALLBACK = [
  strings.fallback.whatWasThat,
  strings.fallback.didntCatchThat,
  strings.fallback.misunderstand
];

const FINAL_FALLBACK = strings.fallback.finalReprompt;

let defaultSuggestions = [
  strings.suggestion.artist.gratefulDead,
  strings.suggestion.artist.cowboyJunkies,
  strings.suggestion.artist.dittyBops
];

let suggestions;

/**
 * map actions to handlers
 * @type {Map}
 */
const actionMap = new Map();
actionMap.set(actions.noInput, noInput);
actionMap.set(actions.unknownInput, Unknown);
actionMap.set(actions.welcomeInput, Welcome);
//TODO: add all actions here

/**
 * Action Endpoint
 *
 * @type {HttpsFunction}
 */
exports.playMedia = functions.https.onRequest(bst.Logless.capture('54bcfb2a-a12b-4c6a-8729-a4ad71c06975', function (req, res) {
// exports.playMedia = functions.https.onRequest(((req, res) => {
  const app = new DialogflowApp({request: req, response: res});
  if (app.hasSurfaceCapability(app.SurfaceCapabilities.MEDIA_RESPONSE_AUDIO)) {
    app.handleRequest(responseHandler);
  } else {
    app.tell(strings.errors.device.mediaResponse);
  }
  storeAction(app, app.getIntent());
  dashbot.configHandler(app);
}));

function init (app) {
  // search

  currentSearchPage = 1;
  invalidSearchPage = false;
  searchByCity = '';
  searchByCollectionValue = '';
  searchByTitle = false;
  searchByTrackTitle = '';
  searchByYear = '';
  strange_variable_used = true;
  strange_variable_IdentifierCount = 0;
  collectionQuery = '';
  topicName = '';
  searchForSeventyEights = false;

  playAudioByRandom = false;
  playAudioByRandomCity = false;
  playAudioByRandomYear = false;

  // playlist

  currentTrackIdx = 0;
  totalTrackNumber = -1;
  playlist = [];
  oneGoPlayAudio = false;
  oneGoCollectionRandomPlayAudio = false;

  // context

  availableCity = 'Los Angeles';
  availableYear = '1971';
  availableYears = [];
  suggestions = defaultSuggestions;

  currentSpeechoutput = -1;
  currentSuggestions = null;
  currentRepromptText = null;

  previousSpeechoutput = -1;
  previousSuggestions = null;
}

function unique (ar) {
  return ar.filter(function (value, index, self) {
    return self.indexOf(value) === index;
  });
}

function repeatInput (app) {
  if (currentSpeechoutput === null) {
    play(app, 0);
  } else {
    ask(app, currentSpeechoutput, currentSuggestions);
  }
}


function noInput (app) {
  let count = 0;

  if (getLastAction(app) === actions.noInput) {
    count = getLastRepetitionCount(app);
  }

  switch (count) {
    case 0:
      ask(app, strings.errors.noInput.first, suggestions);
      break;
    case 1:
      ask(app, '<speak>' + strings.errors.noInput.reprompt + currentRepromptText + '</speak>', suggestions);
      break;
    default:
      tell(app, FINAL_FALLBACK);
      break;
  }
}

function Unknown (app) {
  let count = 0;

  if (getLastAction(app) === actions.unknownInput) {
    count = getLastRepetitionCount(app);
  }

  switch (count) {
    case 0:
      ask(app, '<speak>' + strings.errors.unknownInput.first + '</speak>', suggestions);
      break;
    case 1:
      ask(app, '<speak>' + strings.errors.unknownInput.reprompt + currentRepromptText + '</speak>', suggestions);
      break;
    default:
      tell(app, FINAL_FALLBACK);
      break;
  }
}

function responseHandler (app) {
  // let requestType = (this.event.request !== undefined) ? this.event.request.type : null;

  logger('previousSpeechoutput : ' + previousSpeechoutput);
  logger('previousSuggestions : ' + previousSuggestions);
  logger('currentSpeechoutput : ' + currentSpeechoutput);
  logger('currentSuggestions : ' + currentSuggestions);
  logger('responseHandler : ' + app.getIntent());

  if (app.getIntent() === actions.repeatInput) {
    repeatInput(app);
  } else if (app.getIntent() === actions.discovery) {
    searchForSeventyEights = false;
    Discovery(app);
  } else if (app.getIntent() === actions.playAudio.noOptions) {
    currentSearchPage = 0;
    totalTrackNumber = -1;
    strange_variable_IdentifierCount = 0;
    playlist = [];
    invalidSearchPage = false;
    searchByTitle = false;
    playAudioByRandomYear = false;
    playAudioByRandomCity = false;
    playAudioByRandom = false;
    oneGoPlayAudio = false;
    currentTrackIdx = 0;
    searchForSeventyEights = false;
    play(app, 0);
  } else if (app.getIntent() === actions.searchCollection) {
    totalTrackNumber = -1;
    searchForSeventyEights = false;
    searchByCity = '';
    searchByYear = '';
    getCollection(app);
  } else if (app.getIntent() === actions.playAudio.byCity) {
    currentSearchPage = 0;
    playlist = [];
    totalTrackNumber = -1;
    strange_variable_IdentifierCount = 0;
    invalidSearchPage = false;
    searchByTitle = false;
    playAudioByRandomYear = false;
    playAudioByRandomCity = false;
    playAudioByRandom = false;
    oneGoPlayAudio = false;
    currentTrackIdx = 0;
    searchForSeventyEights = false;
    play(app, 0);
  } else if (app.getIntent() === actions.playAudio.byYearAndCity) {
    currentSearchPage = 0;
    playlist = [];
    totalTrackNumber = -1;
    strange_variable_IdentifierCount = 0;
    invalidSearchPage = false;
    searchByTitle = false;
    playAudioByRandomYear = false;
    playAudioByRandomCity = false;
    playAudioByRandom = false;
    oneGoPlayAudio = false;
    currentTrackIdx = 0;
    searchForSeventyEights = false;
    play(app, 0);
  } else if (app.getIntent() === actions.playAudio.query) {
    currentSearchPage = 0;
    playlist = [];
    totalTrackNumber = 0;
    strange_variable_IdentifierCount = 0;
    invalidSearchPage = false;
    searchByTitle = true;
    playAudioByRandomYear = false;
    playAudioByRandomCity = false;
    playAudioByRandom = false;
    oneGoPlayAudio = false;
    currentTrackIdx = 0;
    searchForSeventyEights = false;
    play(app, 0);
  } else if (app.getIntent() === actions.playAudio.random.year) {
    currentSearchPage = 0;
    totalTrackNumber = -1;
    strange_variable_IdentifierCount = 0;
    playlist = [];
    playAudioByRandomYear = true;
    playAudioByRandomCity = false;
    invalidSearchPage = false;
    searchByTitle = false;
    playAudioByRandom = false;
    oneGoPlayAudio = false;
    currentTrackIdx = 0;
    searchForSeventyEights = false;
    play(app, 0);
  } else if (app.getIntent() === actions.playAudio.random.city) {
    currentSearchPage = 0;
    totalTrackNumber = -1;
    strange_variable_IdentifierCount = 0;
    playlist = [];
    playAudioByRandomYear = false;
    playAudioByRandomCity = true;
    invalidSearchPage = false;
    searchByTitle = false;
    playAudioByRandom = false;
    oneGoPlayAudio = false;
    currentTrackIdx = 0;
    searchForSeventyEights = false;
    play(app, 0);
  } else if (app.getIntent() === actions.playAudio.random.yearAndCity) {
    currentSearchPage = 0;
    totalTrackNumber = -1;
    strange_variable_IdentifierCount = 0;
    playlist = [];
    playAudioByRandomYear = false;
    playAudioByRandomCity = false;
    playAudioByRandom = true;
    oneGoPlayAudio = false;
    invalidSearchPage = false;
    searchByTitle = false;
    currentTrackIdx = 0;
    searchForSeventyEights = false;
    play(app, 0);
  } else if (app.getIntent() === actions.seventyEights.noOptions) {
    currentSearchPage = 0;
    totalTrackNumber = -1;
    strange_variable_IdentifierCount = 0;
    playlist = [];
    invalidSearchPage = false;
    searchByTitle = false;
    currentTrackIdx = 0;
    searchForSeventyEights = true;
    topicName = '';
    playSeventyEights(app, 0);
  } else if (app.getIntent() === actions.seventyEights.byTopic) {
    currentSearchPage = 0;
    totalTrackNumber = -1;
    strange_variable_IdentifierCount = 0;
    playlist = [];
    invalidSearchPage = false;
    searchByTitle = false;
    currentTrackIdx = 0;
    searchForSeventyEights = true;
    playSeventyEights(app, 0);
  } else if (app.getIntent() === actions.oneGo.seventyEights) {
    currentSearchPage = 0;
    totalTrackNumber = -1;
    strange_variable_IdentifierCount = 0;
    playlist = [];
    invalidSearchPage = false;
    searchByTitle = false;
    currentTrackIdx = 0;
    searchForSeventyEights = true;
    playSeventyEights(app, 0);
  } else if (app.getIntent() === actions.oneGo.playAudio) {
    logger('OneGoPlayAudio');
    currentSearchPage = 0;
    totalTrackNumber = -1;
    strange_variable_IdentifierCount = 0;
    playlist = [];
    invalidSearchPage = false;
    searchByTitle = false;
    playAudioByRandomYear = false;
    playAudioByRandomCity = false;
    playAudioByRandom = false;
    oneGoCollectionRandomPlayAudio = false;
    currentTrackIdx = 0;
    searchForSeventyEights = false;
    oneGoPlayAudio = true;
    OneGoPlayAudio(app, 0);
  } else if (app.getIntent() === actions.oneGo.randomPlayAudio) {
    logger('OneGoCollectionRandomPlayAudio');
    currentSearchPage = 0;
    totalTrackNumber = -1;
    strange_variable_IdentifierCount = 0;
    playlist = [];
    invalidSearchPage = false;
    searchByTitle = false;
    playAudioByRandomYear = false;
    playAudioByRandomCity = false;
    playAudioByRandom = false;
    oneGoCollectionRandomPlayAudio = true;
    currentTrackIdx = 0;
    searchForSeventyEights = false;
    oneGoPlayAudio = true;
    OneGoPlayAudio(app, 0);
  } else if (app.getIntent() === actions.information.availableYears) {
    let cardTitle = 'Available Years';
    let repromptText = '';
    let speechOutput = '';
    suggestions = [
      strings.suggestion.artist.discoBiscuits,
      strings.suggestion.artist.hotButteredRum,
      strings.suggestion.artist.kellerWilliams
    ];

    if (searchByCollectionValue === '') {
      repromptText = "<speak>Please select artist name. Like The Ditty Bops,<break time='.5s'/> Or Cowboy Junkies,<break time='.5s'/> Or Grateful Dead.</speak>";
      speechOutput = "<speak>Please select artist name. Like The Ditty Bops,<break time='.5s'/> Or Cowboy Junkies,<break time='.5s'/> Or Grateful Dead.</speak>";
      askWithReprompt(app, speechOutput, repromptText, suggestions);
    } else if (searchByCity === '') {
      repromptText = '<speak>Please select city first.</speak>';
      speechOutput = '<speak>Please select city first.</speak>';
      askWithReprompt(app, speechOutput, repromptText, suggestions);
    } else if (availableYears.length > 0) {
      if (availableYears.length === 1) {
        repromptText = '<speak>Available year for ' + searchByCity + ' is ' + availableYears + ', please select a year.</speak>';
        speechOutput = '<speak>Available year for ' + searchByCity + ' is ' + availableYears + ', please select a year.</speak>';
        askWithReprompt(app, speechOutput, repromptText, suggestions);
      }
      if (availableYears.length > 1) {
        repromptText = '<speak>Available years for ' + searchByCity + ' are ' + availableYears + ', please select a year.</speak>';
        speechOutput = '<speak>Available years for ' + searchByCity + ' are ' + availableYears + ', please select a year.</speak>';
        askWithReprompt(app, speechOutput, repromptText, suggestions);
      }
    }
  } else if (app.getIntent() === 'SongDetail') {
    let cardTitle = 'Available Years';
    let repromptText = '';
    let speechOutput = '';
    if (playlist.length >= 1) {
      repromptText = '<speak>You are listening ' + playlist[currentTrackIdx]['searchByTrackTitle'] + ', ' + playlist[currentTrackIdx]['coverage'] + ', ' + playlist[currentTrackIdx]['searchByYear'] + '.</speak>';
      speechOutput = '<speak>You are listening ' + playlist[currentTrackIdx]['searchByTrackTitle'] + ', ' + playlist[currentTrackIdx]['coverage'] + ', ' + playlist[currentTrackIdx]['searchByYear'] + '.</speak>';
      askWithReprompt(app, speechOutput, repromptText, suggestions);
    } else {
      repromptText = '<speak>No song id Playing now. Please select collection first.</speak>';
      speechOutput = '<speak>No song id Playing now. Please select collection first.</speak>';
      askWithReprompt(app, speechOutput, repromptText, suggestions);
    }
  } else if ((app.getIntent() === actions.mediaStateInput) && (app.getArgument('MEDIA_STATUS').extension.status === app.Media.Status.FINISHED)) {
    // else if (app.getIntent() === actions.mediaStateInput) {
    console.log('PlaybackNearlyFinished');
    // counter++;
    // PlayNext(requestType, 0);
    currentTrackIdx++;
    console.log('counter -' + currentTrackIdx);
    console.log('TotalTrack -' + totalTrackNumber);
    if (currentTrackIdx > totalTrackNumber) {
      currentSearchPage++;
      invalidSearchPage = true;
      console.log('true');
    } else {
      console.log('false');
      invalidSearchPage = false;
    }
    console.log('page -' + currentSearchPage);
    console.log('Type -' + invalidSearchPage);

    if (searchForSeventyEights === true) {
      playSeventyEights(app, 0);
    } else {
      // .play(app, 0);
      if (oneGoPlayAudio) {
        OneGoPlayAudio(app, 0);
      } else {
        play(app, 0);
      }
    }
  } else if ((app.getIntent() === 'AMAZON.NextIntent')) {
    if (currentSpeechoutput !== null) {
      repeatInput(app);
    } else if (searchForSeventyEights === true) {
      let cardTitle = 'Available Years';
      let repromptText = '';
      let speechOutput = '';
      if (totalTrackNumber < 0) {
        repromptText = '<speak>Please Select Topic first</speak>';
        speechOutput = '<speak>Please Select Topic first</speak>';
        askWithReprompt(app, speechOutput, repromptText, suggestions);
      } else {
        currentTrackIdx++;
        if (currentTrackIdx > (totalTrackNumber - 1) && totalTrackNumber >= 0) {
          currentSearchPage++;
          invalidSearchPage = true;
        } else {
          invalidSearchPage = false;
        }

        playSeventyEights(app, 0);
      }
    } else {
      let cardTitle = 'Available Years';
      let repromptText = '';
      let speechOutput = '';
      if (totalTrackNumber === 0) {
        repromptText = '<speak>Please Select City and year first</speak>';
        speechOutput = '<speak>Please Select City and year first</speak>';
        askWithReprompt(app, speechOutput, repromptText, suggestions);
      } else {
        currentTrackIdx++;
        if (currentTrackIdx > (totalTrackNumber - 1) && totalTrackNumber > 0) {
          currentSearchPage++;
          invalidSearchPage = true;
        } else {
          invalidSearchPage = false;
        }
        if (oneGoPlayAudio) {
          OneGoPlayAudio(app, 0);
        } else {
          play(app, 0);
        }
      }
    }
  } else if (app.getIntent() === 'AMAZON.PreviousIntent') {
    if (previousSpeechoutput === -1) {
      repeatInput(app);
    } else if (previousSpeechoutput !== null) {
      ask(app, previousSpeechoutput, previousSuggestions);
    } else if (searchForSeventyEights === true) {
      if (currentTrackIdx > 0) {
        currentTrackIdx--;
      } else {
        currentTrackIdx = 0;
      }
      playSeventyEights(app, 0);
    } else {
      if (currentTrackIdx > 0) {
        currentTrackIdx--;
      } else {
        currentTrackIdx = 0;
      }
      if (oneGoPlayAudio) {
        OneGoPlayAudio(app, 0);
      } else {
        play(app, 0);
      }
    }
  } else {
    app.handleRequestAsync(actionMap);
  }
}

function getCollection (app) {
  searchByCollectionValue = app.getArgument('COLLECTION');
  let collectionRealName = app.getArgument('COLLECTION');
  logger('collection : ' + searchByCollectionValue);
  logger('collection_real_name : ' + searchByCollectionValue);
  if (searchByCollectionValue !== '' || searchByCollectionValue !== undefined) {
    collectionQuery = '';
    let collectionArray = searchByCollectionValue.split(/[ ,]+/);

    if (collectionArray.length > 1) {
      collectionQuery = collectionQuery + '(';

      for (let i = 1; i < collectionArray.length; i++) {
        collectionQuery = collectionQuery + collectionArray[i];
      }

      collectionQuery = collectionQuery + ')+OR+collection:(';
      for (let i = 0; i < collectionArray.length - 1; i++) {
        collectionQuery = collectionQuery + collectionArray[i];
      }

      searchByCollectionValue = searchByCollectionValue.replace(/ /g, '');
      collectionQuery = '(' + collectionQuery + ')+OR+collection:(' + searchByCollectionValue + ')+OR+collection:(the' + searchByCollectionValue + '))';
    } else {
      searchByCollectionValue = searchByCollectionValue.replace(/ /g, '');
      collectionQuery = '(' + collectionQuery + '(' + searchByCollectionValue + ')+OR+collection:(the' + searchByCollectionValue + '))';
    }

    let checkCollectionUrl = podcastAPIURL + collectionQuery + '&fl[]=coverage&fl[]=creator&fl[]=description&fl[]=downloads&fl[]=identifier&fl[]=mediatype&fl[]=subject,year,location&fl[]=title&sort[]=downloads+desc&rows=50&page=0&indent=yes&output=json';
    checkCollectionUrl = customEncodeUri(checkCollectionUrl);
    let optionscheckCollectionUrl = {
      host: ARCHIVE_HOST,
      path: checkCollectionUrl,
      method: 'GET',
      headers: {
        'User-Agent': 'Google_Action_Internet_Archive'
      }
    };
    logger(optionscheckCollectionUrl);

    https.get(optionscheckCollectionUrl, function (res) {
      let body = '';
      res.on('data', function (data) {
        body += data;
      });
      availableCity = 'Los Angeles';
      availableYear = '1971';
      res.on('end', function () {
        logger('Function End');
        let cardTitle = '';
        let repromptText = '';
        let cardOutput = '';
        let speechOutput = '';
        let response = '';
        let resultCollection = parseJsonBody(body);
        logger('resultCollection length : ' + resultCollection['response']['docs'].length);
        if (resultCollection !== null && resultCollection['response']['docs'].length > 0) {
          // http to node server collection title city =null year=null url=checkCollectionUrl resultCollection =result
          for (let i = 0; i < resultCollection['response']['docs'].length; i++) {
            if (resultCollection['response']['docs'][i]['coverage'] !== '' && resultCollection['response']['docs'][i]['coverage'] !== undefined && resultCollection['response']['docs'][i]['searchByYear'] !== '' && resultCollection['response']['docs'][i]['searchByYear'] !== undefined) {
              if (resultCollection['response']['docs'][i]['coverage'].includes(',')) {
                let resCity = resultCollection['response']['docs'][i]['coverage'].split(',');
                availableCity = resCity[0];
                availableYear = resultCollection['response']['docs'][i]['searchByYear'];
                break;
              }
            }
          }
          cardTitle = 'Provide City and Year';
          repromptText = "<speak>Please select a City and year.<break time='.5s'/> Like " + availableCity + ' ' + availableYear + "  or <break time='.1s'/>random.</speak>";
          cardOutput = collectionRealName + ' has been selected. Now, please select CITY and YEAR or RANDOM. Like ' + availableCity + ' ' + availableYear + ' or random.';

          //          speechOutput = "<speak>" + collection_real_name + " has been selected.<break time='.5s'/> Now Please select City and Year or <break time='.1s'/>random. <break time='.5s'/>Like " + //CityName + " " + YearName + " or <break time='.1s'/> random.</speak>";
          speechOutput = '<speak>' + collectionRealName + ' - great choice! Do you have a specific city and year in mind, like ' + availableCity + ' ' + availableYear + ', or would you like me to play something randomly from ' + collectionRealName + '?</speak>';
          log('The Collection ' + searchByCollectionValue + ' has been selected.', searchByCollectionValue, null, null, checkCollectionUrl, function (status) {

          });
          suggestions = [availableCity + ' ' + availableYear, 'Random'];
          askWithReprompt(app, speechOutput, repromptText, suggestions);
        } else {
          cardTitle = 'Collection not exists';
          repromptText = '<speak>' + collectionRealName + ' has no songs. Please try a different artist.</speak>';
          speechOutput = '<speak>Sorry, ' + collectionRealName + " has no song. Please try again by saying<break time='.5s'/> artist name.<break time='.5s'/> Like The Ditty Bops,<break time='.5s'/> Or Cowboy Junkies,<break time='.5s'/> Or Grateful Dead.</speak>";
          cardOutput = 'Sorry, ' + collectionRealName + ' has no song. Please try again by saying ARTIST NAME like The Ditty Bops, Cowboy Junkies Or Grateful Dead.';

          log('Sorry Collection: ' + searchByCollectionValue + ' has no songs.', searchByCollectionValue, null, null, checkCollectionUrl, function (status) {

          });
          searchByCollectionValue = '';
          askWithReprompt(app, speechOutput, repromptText, suggestions);
        }
      });
    }).on('error', function (e) {
      let cardTitle = '';
      let repromptText = '';
      let cardOutput = '';
      let speechOutput = '';
      let response = '';
      cardTitle = 'Waiting for your response.';
      repromptText = '<speak>Sorry, can you say the artist name again?</speak>';
      speechOutput = '<speak>Sorry, can you say the artist name again?</speak>';
      cardOutput = 'Sorry, unable to understand your request. Please try again by saying ARTIST NAME like The Ditty Bops, Cowboy Junkies, Or Grateful Dead.';

      log('Sorry, Unable to understand your request for collection: ' + searchByCollectionValue + ' request ', searchByCollectionValue, null, null, checkCollectionUrl, function (status) {
      });
      searchByCollectionValue = '';
      askWithReprompt(app, speechOutput, repromptText, suggestions);
    });
  } else {
    let cardTitle = 'Please provide valid artist';
    let repromptText = '<speak>Waiting for your response.</speak>';
    let speechOutput = '<speak>Please provide a artist name.</speak>';
    let cardOutput = 'Please provide an artist name.';

    askWithReprompt(app, speechOutput, repromptText, suggestions);
  }
}

let MyAudioPlayer = function (event, context) {
  this.event = event;
  this.context = context;
};

// SeventyEights
function playSeventyEights (app, offsetInMilliseconds) {
  getAudioPlayListSeventyEights(app, currentTrackIdx, this, offsetInMilliseconds, function (err, Obj, response) {
    if (!err) {
      Obj.context.succeed(response);
    } else {
      Obj.context.succeed(response);
    }
  });
}

function getAudioPlayListSeventyEights (app, counter, thisOBJ, offsetInMilliseconds, callback) {
  let track = counter + 1;
  if ((playlist.length > 0 && app.getIntent() !== 'SeventyEights' && app.getIntent() !== 'OneGoSeventyEights' && app.getIntent() !== 'PlaByTopic' && invalidSearchPage === false)) {
    if (track > playlist.length) {
      counter = 0;
      track = counter + 1;
    }
    // logger('test');
    let trackcounter = counter;
    let start = totalTrackNumber - (playlist.length - 1);
    let end = totalTrackNumber;
    let x = Math.floor((Math.random() * end) + start);
    logger('Track - ' + x);
    logger('Start - ' + start);
    logger('End - ' + end);
    trackcounter = x;
    audioURL = 'https://archive.org/download/' + playlist[counter]['identifier'] + '/' + playlist[counter]['trackName'];
    logger(app.getIntent());
    logger('problem1 : ' + audioURL);
    if ((app.getIntent() === actions.mediaStateInput) && (app.getArgument('MEDIA_STATUS').extension.status === app.Media.Status.FINISHED)) {
      askAudioWithoutCoverageYear(app, playlist[counter]['identifier'], track, playlist[counter]['searchByTrackTitle'], playlist[counter]['coverage'], playlist[counter]['searchByYear'], audioURL, suggestions);
    } else {
      askAudioWithoutCoverageYear(app, playlist[counter]['identifier'], track, playlist[counter]['searchByTrackTitle'], playlist[counter]['coverage'], playlist[counter]['searchByYear'], audioURL, suggestions);
    }
  } else if (app.getIntent() === 'SeventyEights' || app.getIntent() === 'PlaByTopic' || app.getIntent() === 'OneGoSeventyEights' || invalidSearchPage === true) {
    if (app.getIntent() === 'SeventyEights') {
      logger('into Seventy Eights');
      logger(app.getIntent());
      let cardTitle = 'Collection Seventy Eights Has Been Selected.';
      let repromptText = '<speak>Waiting for your response.</speak>';
      let speechOutput = "<speak>Collection Seventy Eights Has Been Selected.<break time='.1s'/> Please select a topic like Jazz, Instrumental, or Dance</speak>";
      suggestions = ['Jazz', 'Instrumental', 'Dance'];
      askWithReprompt(app, speechOutput, repromptText, suggestions);
    } else if (app.getIntent() === 'PlaByTopic' || invalidSearchPage === true || app.getIntent() === 'OneGoSeventyEights') {
      if (app.getIntent() === 'PlaByTopic' || app.getIntent() === 'OneGoSeventyEights') {
        topicName = searchByTrackTitle = app.getArgument('TOPIC');
      }

      topicName = topicName.replace(' and ', '#');
      topicName = topicName.replace('&', '#');
      topicName = topicName.replace(/ /g, '');
      topicName = topicName.replace('#', ' ');
      topicName = topicName.replace(/[^a-zA-Z0-9 ]/g, '');
      // APIURL = SeventyEightsAPIURL + '(' + topicName + ')&fl[]=coverage&fl[]=creator&fl[]=description&fl[]=downloads&fl[]=identifier&fl[]=mediatype&fl[]=subject,year,location&fl[]=title&sort[]=random&rows=1&page=' + page + '&indent=yes&output=json';
      let APIURL = SeventyEightsAPIURL + '(' + topicName + ')&fl[]=coverage&fl[]=creator&fl[]=description&fl[]=downloads&fl[]=identifier&fl[]=mediatype&fl[]=subject,year,location&fl[]=title&sort[]=random&rows=1&page=' + currentSearchPage + '&indent=yes&output=json';
      APIURL = customEncodeUri(APIURL);
      let options = {
        host: ARCHIVE_HOST,
        path: APIURL,
        method: 'GET',
        headers: {
          'User-Agent': 'Google_Action_Internet_Archive'
        }
      };

      logger(options);
      https.get(options, function (res) {
        let body = '';
        res.on('data', function (data) {
          body += data;
        });
        res.on('end', function () {
          let result = parseJsonBody(body);
          if (result !== null && result['response']['docs'].length > 0) {
            let APIURLIDENTIFIER = APIURLIdentifier + result['response']['docs'][0]['identifier'] + '/files';
            APIURLIDENTIFIER = customEncodeUri(APIURLIDENTIFIER);
            let optionsIdentifier = {
              host: ARCHIVE_HOST,
              path: APIURLIDENTIFIER,
              method: 'GET',
              headers: {
                'User-Agent': 'Google_Action_Internet_Archive'
              }
            };

            https.get(optionsIdentifier, function (response) {
              let bodyIdentifier = '';
              response.on('data', function (dataIdentifier) {
                bodyIdentifier += dataIdentifier;
              });

              response.on('end', function () {
                let resultIdentifier = JSON.parse(bodyIdentifier);
                if (resultIdentifier !== null && resultIdentifier['result'].length > 0) {
                  let trackNumber = 0;
                  let lastsongsize = '';
                  for (let i = 0; i < resultIdentifier['result'].length; i++) {
                    if (resultIdentifier['result'][i]['format'] === 'VBR MP3' && lastsongsize !== resultIdentifier['result'][i]['length']) {
                      lastsongsize = resultIdentifier['result'][i]['length'];
                      if (resultIdentifier['result'][i]['searchByTrackTitle'] === undefined) {
                        trackNumber = trackNumber + 1;
                        playlist.push({
                          identifier: result['response']['docs'][0]['identifier'],
                          trackName: resultIdentifier['result'][i]['name'],
                          title: 'Track Number ' + trackNumber,
                          coverage: (result['response']['docs'][0]['coverage']) ? result['response']['docs'][0]['coverage'] : 'Coverage Not mentioned',
                          year: (result['response']['docs'][0]['searchByYear']) ? result['response']['docs'][0]['searchByYear'] : 'Year Not mentioned'
                        });
                      } else {
                        trackNumber = trackNumber + 1;
                        resultIdentifier['result'][i]['searchByTrackTitle'] = resultIdentifier['result'][i]['searchByTrackTitle'].replace(/[^a-zA-Z0-9 ]/g, '');
                        playlist.push({
                          identifier: result['response']['docs'][0]['identifier'],
                          trackName: resultIdentifier['result'][i]['name'],
                          title: resultIdentifier['result'][i]['searchByTrackTitle'],
                          coverage: (result['response']['docs'][0]['coverage']) ? result['response']['docs'][0]['coverage'] : 'Coverage Not mentioned',
                          year: (result['response']['docs'][0]['searchByYear']) ? result['response']['docs'][0]['searchByYear'] : 'Year Not mentioned'
                        });
                      }
                      totalTrackNumber++;
                    }
                  }
                  // TotalTrack=TotalTrack+playlist.length-1;
                  // logger('TrackCount -'+TotalTrack);
                  // logger('Array Size -'+playlist.length);
                  let trackcounter = counter;
                  let start = totalTrackNumber - (playlist.length - 1);
                  let end = totalTrackNumber;
                  let x = Math.floor((Math.random() * end) + start);
                  logger('Track - ' + x);
                  logger('Start - ' + start);
                  logger('End - ' + end);
                  trackcounter = x;
                  audioURL = 'https://archive.org/download/' + playlist[counter]['identifier'] + '/' + playlist[counter]['trackName'];
                  logger('problem2 : ' + audioURL);
                  if ((app.getIntent() === actions.mediaStateInput) && (app.getArgument('MEDIA_STATUS').extension.status === app.Media.Status.FINISHED)) {
                    askAudioWithoutCoverageYear(app, playlist[counter]['identifier'], track, playlist[counter]['searchByTrackTitle'], playlist[counter]['coverage'], playlist[counter]['searchByYear'], audioURL, suggestions);
                  } else {
                    askAudioWithoutCoverageYear(app, playlist[counter]['identifier'], track, playlist[counter]['searchByTrackTitle'], playlist[counter]['coverage'], playlist[counter]['searchByYear'], audioURL, suggestions);
                  }
                } else {
                  let cardTitle = 'No Songs Found';
                  let repromptText = "<speak>I couldn't find any songs. Please select another topic.</speak>";
                  let speechOutput = '<speak>Sorry, no songs found. Please select another topic like Jazz.</speak>';
                  suggestions = ['Jazz', 'Instrumental', 'Dance'];
                  askWithReprompt(app, speechOutput, repromptText, suggestions);
                }
              });
            }).on('error', function (e) {
              let cardTitle = 'Unable to understand your request. Please try again.';
              let repromptText = '<speak>Waiting for your response.</speak>';
              let speechOutput = '<speak>Sorry, can you say that again?</speak>';
              askWithReprompt(app, speechOutput, repromptText, suggestions);
            });
          } else {
            let cardTitle = 'No Songs Found';
            let repromptText = '<speak>No songs found. Please try again.</speak>';
            let speechOutput = "<speak>Sorry, I couldn't find any songs. Please try again.</speak>";
            askWithReprompt(app, speechOutput, repromptText, suggestions);
          }
        });
      }).on('error', function (e) {
        searchByYear = '';
        searchByCity = '';
        let cardTitle = 'Unable to understand your request. Please try again.';
        let repromptText = '<speak>Waiting for your response.</speak>';
        let speechOutput = '<speak>Sorry, can you say that again?</speak>';
        askWithReprompt(app, speechOutput, repromptText, suggestions);
      });
    }
  } else {
    let cardTitle = 'Unable to understand your request.';
    let repromptText = '<speak>Waiting for your response.</speak>';
    let speechOutput = '<speak>Sorry, can you say your city name and year again? Random is also an option.</speak>';

    askWithReprompt(app, speechOutput, repromptText, suggestions);
  }
}
// SeventyEights

function PlayNext (app, requestType, offsetInMilliseconds) {
  let track = currentTrackIdx + 1;
  let prevTrack = currentTrackIdx;
  if (playlist.length > 0) {
    if (track > playlist.length) {
      currentTrackIdx = 0;
      track = currentTrackIdx + 1;
    }
    let trackcounter = currentTrackIdx;
    if (playAudioByRandomYear === true || playAudioByRandomCity === true || playAudioByRandom === true) {
      let start = totalTrackNumber - (playlist.length - 1);
      let end = totalTrackNumber;
      let x = Math.floor((Math.random() * end) + start);
      logger('Track - ' + x);
      logger('Start - ' + start);
      logger('End - ' + end);
      trackcounter = x;
      audioURL = 'https://archive.org/download/' + playlist[x]['identifier'] + '/' + playlist[x]['trackName'];
      if (playAudioByRandomYear === true) {
        log('Auto Next Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, searchByCity, 'random', APIURL, function (status) {
        });
      } else if (playAudioByRandomCity === true) {
        log('PAuto Next laying Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, 'random', searchByYear, APIURL, function (status) {
        });
      } else if (playAudioByRandom === true) {
        log('Auto Next Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, 'random', 'random', APIURL, function (status) {
        });
      }
    } else {
      audioURL = 'https://archive.org/download/' + playlist[currentTrackIdx]['identifier'] + '/' + playlist[currentTrackIdx]['trackName'];
      log('Auto Next Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, searchByCity, searchByYear, APIURL, function (status) {
      });
    }
    // logger('Auto Next -'+audioURL);
    askAudio(app, playlist[trackcounter]['identifier'], track, playlist[trackcounter]['searchByTrackTitle'], playlist[trackcounter]['coverage'], playlist[trackcounter]['searchByYear'], audioURL, suggestions);
  } else {
    logger('Auto Next - Not Found');
    let cardTitle = 'Unable to understand your request.';
    let repromptText = '<speak>Waiting for your response.</speak>';
    let speechOutput = '<speak>Sorry, can you say your city name and year again? Random is also an option.</speak>';

    askWithReprompt(app, speechOutput, repromptText, suggestions);
  }
}

function logger (strLog) {
  debug(util.inspect(strLog, false, null));
}

function customEncodeUri (uri) {
  if (uri !== null && uri !== '') {
    return replaceall(' ', '+', uri);
  }
  return '';
}

function getOneGoPlayAudio (app, counter, thisOBJ, offsetInMilliseconds, callback) {
  let track = counter + 1;

  if ((playlist.length > 0 && app.getIntent() !== 'OneGoPlayAudio' && app.getIntent() !== 'OneGoCollectionRandomPlayAudio' && invalidSearchPage === false)) {
    if (track > playlist.length) {
      counter = 0;
      track = counter + 1;
    }
    // logger('test');
    let trackcounter = counter;
    if (oneGoCollectionRandomPlayAudio === true) {
      // let start = TotalTrack - (playlist.length - 1);
      // let end = TotalTrack;
      // let x = Math.floor((Math.random() * end) + start);
      // logger('Track - ' + x);
      // logger('Start - ' + start);
      // logger('End - ' + end);
      // trackcounter = x;
      let x = trackcounter;
      audioURL = 'https://archive.org/download/' + playlist[x]['identifier'] + '/' + playlist[x]['trackName'];
      if (oneGoCollectionRandomPlayAudio === true) {
        log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, 'random', 'random', APIURL, function (status) {
        });
      }
    } else {
      audioURL = 'https://archive.org/download/' + playlist[trackcounter]['identifier'] + '/' + playlist[trackcounter]['trackName'];
      log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, searchByCity, searchByYear, APIURL, function (status) {
      });
    }
    // logger(app.getIntent());
    if ((app.getIntent() === actions.mediaStateInput) && (app.getArgument('MEDIA_STATUS').extension.status === app.Media.Status.FINISHED)) {
      askAudio(app, playlist[trackcounter]['identifier'], track, playlist[trackcounter]['searchByTrackTitle'], playlist[trackcounter]['coverage'], playlist[trackcounter]['searchByYear'], audioURL, suggestions);
    } else {
      askAudio(app, playlist[trackcounter]['identifier'], track, playlist[trackcounter]['searchByTrackTitle'], playlist[trackcounter]['coverage'], playlist[trackcounter]['searchByYear'], audioURL, suggestions);
    }
  } else if (app.getIntent() === 'OneGoPlayAudio' || invalidSearchPage === true || app.getIntent() === 'OneGoCollectionRandomPlayAudio') {
    if (app.getIntent() === 'OneGoPlayAudio' || app.getIntent() === 'OneGoCollectionRandomPlayAudio') {
      if (oneGoCollectionRandomPlayAudio === false) {
        searchByCity = app.getArgument('CITY');
        searchByYear = app.getArgument('YEAR');
      }
      searchByCollectionValue = app.getArgument('COLLECTION');
      let collectionRealName = app.getArgument('COLLECTION');
      let APIURL;
      if (searchByCollectionValue !== null && searchByCollectionValue !== '' && searchByCollectionValue !== undefined) {
        collectionQuery = '';
        let collectionArray = searchByCollectionValue.split(/[ ,]+/);

        if (collectionArray.length > 1) {
          collectionQuery = collectionQuery + '(';

          for (let i = 1; i < collectionArray.length; i++) {
            collectionQuery = collectionQuery + collectionArray[i];
          }

          collectionQuery = collectionQuery + ')+OR+collection:(';
          for (let i = 0; i < collectionArray.length - 1; i++) {
            collectionQuery = collectionQuery + collectionArray[i];
          }

          searchByCollectionValue = searchByCollectionValue.replace(/ /g, '');
          collectionQuery = '(' + collectionQuery + ')+OR+collection:(' + searchByCollectionValue + ')+OR+collection:(the' + searchByCollectionValue + '))';
        } else {
          searchByCollectionValue = searchByCollectionValue.replace(/ /g, '');
          collectionQuery = '(' + collectionQuery + '(' + searchByCollectionValue + ')+OR+collection:(the' + searchByCollectionValue + '))';
        }

        if (oneGoCollectionRandomPlayAudio === true) {
          APIURL = podcastCityAPIURL + collectionQuery + '&fl[]=coverage&fl[]=creator&fl[]=description&fl[]=downloads&fl[]=identifier&fl[]=mediatype&fl[]=subject,year,location&fl[]=title&sort[]=random&rows=1&page=' + currentSearchPage + '&indent=yes&output=json';
        } else {
          APIURL = podcastCityAPIURL + collectionQuery + '+AND+coverage%3A(' + searchByCity + ')+AND+year%3A(' + searchByYear + ')&fl[]=coverage&fl[]=creator&fl[]=description&fl[]=downloads&fl[]=identifier&fl[]=mediatype&fl[]=subject,year,location&fl[]=title&sort[]=downloads+desc&rows=1&page=' + currentSearchPage + '&indent=yes&output=json';
        }
      } else {
        if (strange_variable_used) {
          searchByYear = '';
          searchByCity = '';
          strange_variable_used = false;
        }
        if (oneGoCollectionRandomPlayAudio === true) {
          APIURL = podcastCityAPIURL + collectionQuery + '&fl[]=coverage&fl[]=creator&fl[]=description&fl[]=downloads&fl[]=identifier&fl[]=mediatype&fl[]=subject,year,location&fl[]=title&sort[]=random&rows=1&page=' + currentSearchPage + '&indent=yes&output=json';
        } else {
          APIURL = podcastCityAPIURL + collectionQuery + '+AND+coverage%3A(' + searchByCity + ')+AND+year%3A(' + searchByYear + ')&fl[]=coverage&fl[]=creator&fl[]=description&fl[]=downloads&fl[]=identifier&fl[]=mediatype&fl[]=subject,year,location&fl[]=title&sort[]=downloads+desc&rows=1&page=' + currentSearchPage + '&indent=yes&output=json';
        }
      }
      APIURL = customEncodeUri(APIURL);
      let options = {
        host: ARCHIVE_HOST,
        path: APIURL,
        method: 'GET',
        headers: {
          'User-Agent': 'Google_Action_Internet_Archive'
        }
      };
      logger(options);
      https.get(options, function (res) {
        let body = '';
        res.on('data', function (data) {
          body += data;
        });

        res.on('end', function () {
          logger('body : ' + body);
          let result = parseJsonBody(body);
          if (result !== null && result['response']['docs'].length > 0) {
            if ((app.getIntent() === 'OneGoPlayAudio') || (app.getIntent() === 'OneGoCollectionRandomPlayAudio') || (((searchByCity !== '' && searchByYear !== '') || oneGoCollectionRandomPlayAudio === true) && collectionQuery !== '')) {
              if (app.getIntent() === 'OneGoPlayAudio' || app.getIntent() === 'OneGoCollectionRandomPlayAudio' || currentSearchPage === 0) {
                counter = 0;
                playlist = [];
              }
              if (result['response']['numFound'] < strange_variable_IdentifierCount) {
                strange_variable_used = true;
              } else {
                strange_variable_IdentifierCount++;
              }
              // New Https Request for mp3 tracks
              // track=counter+1;
              let APIURLIDENTIFIER = APIURLIdentifier + result['response']['docs'][0]['identifier'] + '/files';
              APIURLIDENTIFIER = customEncodeUri(APIURLIDENTIFIER);
              let optionsIdentifier = {
                host: ARCHIVE_HOST,
                path: APIURLIDENTIFIER,
                method: 'GET',
                headers: {
                  'User-Agent': 'Google_Action_Internet_Archive'
                }
              };

              logger(optionsIdentifier);
              https.get(optionsIdentifier, function (response) {
                let bodyIdentifier = '';
                response.on('data', function (dataIdentifier) {
                  bodyIdentifier += dataIdentifier;
                });

                response.on('end', function () {
                  let resultIdentifier = JSON.parse(bodyIdentifier);
                  if (resultIdentifier !== null && resultIdentifier['result'].length > 0) {
                    let trackNumber = 0;
                    for (let i = 0; i < resultIdentifier['result'].length; i++) {
                      if (resultIdentifier['result'][i]['format'] === 'VBR MP3') {
                        if (resultIdentifier['result'][i]['searchByTrackTitle'] === undefined) {
                          trackNumber = trackNumber + 1;
                          playlist.push({
                            identifier: result['response']['docs'][0]['identifier'],
                            trackName: resultIdentifier['result'][i]['name'],
                            title: 'Track Number ' + trackNumber,
                            coverage: (result['response']['docs'][0]['coverage']) ? result['response']['docs'][0]['coverage'] : 'Coverage Not mentioned',
                            year: (result['response']['docs'][0]['searchByYear']) ? result['response']['docs'][0]['searchByYear'] : 'Year Not mentioned'
                          });
                        } else {
                          resultIdentifier['result'][i]['searchByTrackTitle'] = resultIdentifier['result'][i]['searchByTrackTitle'].replace(/[^a-zA-Z0-9 ]/g, '');
                          trackNumber = trackNumber + 1;
                          playlist.push({
                            identifier: result['response']['docs'][0]['identifier'],
                            trackName: resultIdentifier['result'][i]['name'],
                            title: resultIdentifier['result'][i]['searchByTrackTitle'],
                            coverage: (result['response']['docs'][0]['coverage']) ? result['response']['docs'][0]['coverage'] : 'Coverage Not mentioned',
                            year: (result['response']['docs'][0]['searchByYear']) ? result['response']['docs'][0]['searchByYear'] : 'Year Not mentioned'
                          });
                        }
                        totalTrackNumber++;
                      }
                    }
                    logger('TotalTrack' + totalTrackNumber);
                    // TotalTrack=TotalTrack+playlist.length-1;

                    let trackcounter = counter;
                    if (oneGoCollectionRandomPlayAudio === true) {
                      // let start = TotalTrack - (playlist.length - 1);
                      // let end = TotalTrack;
                      // let x = Math.floor((Math.random() * end) + start);
                      // logger('Track - ' + x);
                      // logger('Start - ' + start);
                      // logger('End - ' + end);
                      // trackcounter = x;
                      let x = trackcounter;
                      audioURL = 'https://archive.org/download/' + playlist[x]['identifier'] + '/' + playlist[x]['trackName'];
                      if (oneGoCollectionRandomPlayAudio === true) {
                        log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, 'random', 'random', APIURL, function (status) {
                        });
                      }
                    } else {
                      audioURL = 'https://archive.org/download/' + playlist[counter]['identifier'] + '/' + playlist[counter]['trackName'];
                      log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, searchByCity, searchByYear, APIURL, function (status) {
                      });
                    }

                    if ((app.getIntent() === actions.mediaStateInput) && (app.getArgument('MEDIA_STATUS').extension.status === app.Media.Status.FINISHED)) {
                      askAudio(app, playlist[trackcounter]['identifier'], track, playlist[trackcounter]['searchByTrackTitle'], playlist[trackcounter]['coverage'], playlist[trackcounter]['searchByYear'], audioURL, suggestions);
                    } else {
                      askAudio(app, playlist[trackcounter]['identifier'], track, playlist[trackcounter]['searchByTrackTitle'], playlist[trackcounter]['coverage'], playlist[trackcounter]['searchByYear'], audioURL, suggestions);
                    }
                  } else {
                    let cardTitle = 'No Songs Found';
                    let repromptText = "<speak>Sorry, I couldn't find any songs. Try a different city or year, or I can play something random for you.</speak>";
                    let speechOutput = "<speak>Sorry, I couldn't find any songs. Try a different city or year, or I can play something random for you.</speak>";
                    let cardOutput = 'Sorry, No songs found. Please try again by saying City and Year or Random';
                    askWithReprompt(app, speechOutput, repromptText, suggestions);
                  }
                });
              }).on('error', function (e) {
                let cardTitle = 'Unable to understand your request. ';
                let repromptText = '<speak>Sorry, can you say your city name and year again? Random is also an option.</speak>';
                let speechOutput = '<speak>Sorry, can you say your city name and year again? Random is also an option.</speak>';
                let cardOutput = 'Sorry, Unable to understand your request. Please try again by saying City and Year or Random.';
                askWithReprompt(app, speechOutput, repromptText, suggestions);
              });
            }
          } else {
            if (playAudioByRandom) {
              log('Sorry , No result found for command play ' + searchByCollectionValue + ' random  ', searchByCollectionValue, 'random', 'random', APIURL, function (status) {
              });
            } else {
              log('Sorry , No result found for command play ' + searchByCollectionValue + ' ' + searchByCity + ' ' + searchByYear + '   ', searchByCollectionValue, searchByCity, searchByYear, APIURL, function (status) {
              });
            }
            searchByYear = '';
            searchByCity = '';
            let cardTitle = 'No Songs Found';
            let repromptText = "<speak>Sorry, I couldn't find any songs. Try a different city or year, or I can play something random for you.</speak>";
            let speechOutput = "<speak>Sorry, I couldn't find any songs. Try a different city or year, or I can play something random for you.</speak>";
            let cardOutput = 'Sorry, No songs found. Please try again by saying City and Year or random.';
            askWithReprompt(app, speechOutput, repromptText, suggestions);
          }
        });
      }).on('error', function (e) {
        searchByYear = '';
        searchByCity = '';
        let cardTitle = 'Unable to understand your request.';
        let repromptText = '<speak>Sorry, can you say your city name and year again? Random is also an option.</speak>';
        let speechOutput = '<speak>Sorry, can you say your city name and year again? Random is also an option.</speak>';
        let cardOutput = 'Sorry, Unable to understand your request. Please try again by saying City and Year or Random.';
        askWithReprompt(app, speechOutput, repromptText, suggestions);
      });
    } else {
      let cardTitle = 'Unable to understand your request.';
      let repromptText = '<speak>Sorry, can you say your city name and year again? Random is also an option.</speak>';
      let speechOutput = '<speak>Sorry, can you say your city name and year again? Random is also an option.</speak>';
      let cardOutput = 'Sorry, Unable to understand your request. Please try again by saying City and Year or Random.';

      askWithReprompt(app, speechOutput, repromptText, suggestions);
    }
  }
}

function parseJsonBody (body) {
  logger(body);
  return JSON.parse(body);
}

function Welcome (app) {
  init(app);
  // askAudio(app, "Test Song", "https://ia802307.us.archive.org/20/items/gd73-06-10.sbd.hollister.174.sbeok.shnf/RFKJune73extras/Booklet/center_vbr.mp3", suggestions);

  let cardTitle = 'Welcome';
  let repromptText = "<speak>Waiting for your response. <break time='.2s'/> What artist would you like to listen to?</speak>";
  let cardOutput = 'Welcome to the live music collection at the Internet Archive. What artist would you like to listen to? For example The Ditty Bops, The Grateful Dead or The Cowboy Junkies.';
  let speechOutput = "<speak><audio src='https://s3.amazonaws.com/gratefulerrorlogs/CrowdNoise.mp3' />  Welcome to the live music collection at the Internet Archive.<break time='.5s'/> What artist would you like to listen to? <break time='.5s'/>  For example, the ditty bops, the grateful dead, or the cowboy junkies.  </speak>";
  // let speechOutput = "<speak>Welcome to the live music collection at the Internet Archive.<break time='.5s'/> What artist would you like to listen to? <break time='.5s'/>  For example, the ditty bops, the grateful dead, or the cowboy junkies. </speak>";

  if (app.getLastSeen() !== null) {
    speechOutput = "<speak>Welcome back, choose an artist.<break time='.5s'/> For example, the ditty bops, the grateful dead, or the cowboy junkies. </speak>";
  }

  askWithReprompt(app, speechOutput, repromptText, suggestions);
}

function getAudioPlayList (app, counter, thisOBJ, offsetInMilliseconds, callback) {
  if (searchByCollectionValue !== '' || searchByTitle) {
    let track = counter + 1;

    if ((playlist.length > 0 && app.getIntent() !== 'PlayAudio' && app.getIntent() !== 'PlayAudioByRandom' && app.getIntent() !== 'PlayAudioByCity' && app.getIntent() !== 'PlayAudioByRandomYear' && app.getIntent() !== 'PlayAudioByRandomCity' && app.getIntent() !== 'PlayAudioQuery' && invalidSearchPage === false)) {
      if (track > playlist.length) {
        counter = 0;
        track = counter + 1;
      }
      // logger('test');
      let trackcounter = counter;
      if (playAudioByRandomYear === true || playAudioByRandomCity === true || playAudioByRandom === true) {
        let start = totalTrackNumber - (playlist.length - 1);
        let end = totalTrackNumber;
        let x = Math.floor((Math.random() * end) + start);
        logger('Track - ' + x);
        logger('Start - ' + start);
        logger('End - ' + end);
        trackcounter = x;
        audioURL = 'https://archive.org/download/' + playlist[x]['identifier'] + '/' + playlist[x]['trackName'];
        if (playAudioByRandomYear === true) {
          log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, searchByCity, 'random', APIURL, function (status) {
          });
        } else if (playAudioByRandomCity === true) {
          log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, 'random', searchByYear, APIURL, function (status) {
          });
        } else if (playAudioByRandom === true) {
          log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, 'random', 'random', APIURL, function (status) {
          });
        }
      } else {
        audioURL = 'https://archive.org/download/' + playlist[trackcounter]['identifier'] + '/' + playlist[trackcounter]['trackName'];
        log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, searchByCity, searchByYear, APIURL, function (status) {
        });
      }
      // logger(app.getIntent());
      if ((app.getIntent() === actions.mediaStateInput) && (app.getArgument('MEDIA_STATUS').extension.status === app.Media.Status.FINISHED)) {
        logger('autoNext');
        askAudio(app, playlist[trackcounter]['identifier'], track, playlist[trackcounter]['searchByTrackTitle'], playlist[trackcounter]['coverage'], playlist[trackcounter]['searchByYear'], audioURL, suggestions);
      } else {
        logger('!autoNext');
        askAudio(app, playlist[trackcounter]['identifier'], track, playlist[trackcounter]['searchByTrackTitle'], playlist[trackcounter]['coverage'], playlist[trackcounter]['searchByYear'], audioURL, suggestions);
      }
    } else if (app.getIntent() === 'PlayAudio' || app.getIntent() === 'PlayAudioByCity' || app.getIntent() === 'PlayAudioByRandom' || app.getIntent() === 'PlayAudioByRandomYear' || app.getIntent() === 'PlayAudioByRandomCity' || app.getIntent() === 'PlayAudioByYearCity' || app.getIntent() === 'PlayAudioQuery' || invalidSearchPage === true) {
      let APIURL;
      if (searchByTitle || app.getIntent() === 'PlayAudioQuery') {
        if (app.getIntent() === 'PlayAudioQuery') {
          searchByTrackTitle = app.getArgument('TITLE');
        }
        APIURL = podcastAPIURLNEW + searchByTrackTitle + '%20AND(mediatype:audio)&fl[]=creator&fl[]=description&fl[]=downloads&fl[]=identifier&fl[]=mediatype&fl[]=subject&fl[]=title&sort[]=downloads+desc&rows=1&page=' + currentSearchPage + '&indent=yes&output=json';
      } else if (playAudioByRandomYear || app.getIntent() === 'PlayAudioByRandomYear') {
        if (app.getIntent() === 'PlayAudioByRandomYear') {
          searchByCity = app.getArgument('CITY');
        }
        APIURL = podcastCityAPIURL + collectionQuery + '+AND+coverage:(' + searchByCity + ')&fl[]=coverage&fl[]=creator&fl[]=description&fl[]=downloads&fl[]=identifier&fl[]=mediatype&fl[]=subject,year,location&fl[]=title&sort[]=random&rows=1&page=' + currentSearchPage + '&indent=yes&output=json';
      } else if (playAudioByRandom || app.getIntent() === 'PlayAudioByRandom') {
        APIURL = podcastCityAPIURL + collectionQuery + '&fl[]=coverage&fl[]=creator&fl[]=description&fl[]=downloads&fl[]=identifier&fl[]=mediatype&fl[]=subject,year,location&fl[]=title&sort[]=random&rows=1&page=' + currentSearchPage + '&indent=yes&output=json';
      } else if (playAudioByRandomCity || app.getIntent() === 'PlayAudioByRandomCity') {
        if (app.getIntent() === 'PlayAudioByRandomCity') {
          searchByYear = app.getArgument('YEAR');
        }
        APIURL = podcastAPIURL + collectionQuery + '+AND+year:(' + searchByYear + ')&fl[]=coverage&fl[]=creator&fl[]=description&fl[]=downloads&fl[]=identifier&fl[]=mediatype&fl[]=subject,year,location&fl[]=title&sort[]=random&rows=1&page=' + currentSearchPage + '&indent=yes&output=json';
      } else {
        if (strange_variable_used) {
          searchByYear = '';
          searchByCity = '';
          strange_variable_used = false;
        }

        if (app.getIntent() === 'PlayAudioByYearCity') {
          searchByYear = app.getArgument('YEAR');
          searchByCity = app.getArgument('CITY');
        } else if (app.getIntent() === 'PlayAudio') {
          searchByYear = app.getArgument('YEAR');
          APIURL = podcastAPIURL + collectionQuery + '+AND+year:(' + searchByYear + ')';
        } else if (app.getIntent() === 'PlayAudioByCity') {
          searchByCity = app.getArgument('CITY');
          APIURL = podcastCityAPIURL + collectionQuery + '+AND+coverage%3A(' + searchByCity + ')';
        }

        if (searchByYear !== '' && searchByCity !== '') {
          APIURL = podcastCityAPIURL + collectionQuery + '+AND+coverage%3A(' + searchByCity + ')+AND+year%3A(' + searchByYear + ')';
        }
        if (app.getIntent() === 'PlayAudioByCity') {
          APIURL = APIURL + '&fl[]=coverage&fl[]=creator&fl[]=description&fl[]=downloads&fl[]=identifier&fl[]=mediatype&fl[]=subject,year,location&fl[]=title&sort[]=random&rows=50&page=' + currentSearchPage + '&indent=yes&output=json';
        } else {
          APIURL = APIURL + '&fl[]=coverage&fl[]=creator&fl[]=description&fl[]=downloads&fl[]=identifier&fl[]=mediatype&fl[]=subject,year,location&fl[]=title&sort[]=downloads+desc&rows=1&page=' + currentSearchPage + '&indent=yes&output=json';
        }
      }
      APIURL = customEncodeUri(APIURL);
      let options = {
        host: ARCHIVE_HOST,
        path: APIURL,
        method: 'GET',
        headers: {
          'User-Agent': 'Google_Action_Internet_Archive'
        }
      };
      logger(options);
      https.get(options, function (res) {
        let body = '';
        res.on('data', function (data) {
          body += data;
        });

        res.on('end', function () {
          let result = parseJsonBody(body);
          if (result !== null && result['response']['docs'].length > 0) {
            if ((app.getIntent() === 'PlayAudioByCity' || app.getIntent() === 'PlayAudio') && (searchByYear === '' || searchByCity === '')) {
              let YearString = '';
              let CityList = [];
              let CityString = '';
              if (app.getIntent() === 'PlayAudioByCity' && searchByYear === '') {
                for (let i = 0; i < result['response']['docs'].length; i++) {
                  availableYears.push(result['response']['docs'][i]['searchByYear']);
                }
                availableYears = unique(availableYears);
                availableYears = availableYears.sort();

                // for (let i = 0; i < YearList.length; i++) {
                //   YearString = YearString + YearList[i] + ', ';
                // }

                let cardTitle = 'Please select a year.';
                let repromptText = '<speak> Waiting for your response.</speak>';
                let speechOutput = '<speak> Year list for ' + searchByCity + ' is not available. Please select random.</speak>';

                if (availableYears.length === 1) {
                  YearString = availableYears[0];
                  speechOutput = '<speak> Ok, Grateful Dead has played in ' + searchByCity + ' in ' + YearString + '. Do you have a particular year in mind?</speak>';
                } else if (availableYears.length > 1) {
                  YearString = availableYears[0] + ' to ' + availableYears[availableYears.length - 1];
                  speechOutput = '<speak> Ok, Grateful Dead has played in ' + searchByCity + ' sometime between ' + YearString + '. Do you have a particular year in mind?</speak>';
                }

                log('Ok, for ' + searchByCollectionValue + ' in ' + searchByCity + ' I have music from ' + YearString, searchByCollectionValue, searchByCity, searchByYear, APIURL, function (status) {
                });
                suggestions = availableYears;
                askWithReprompt(app, speechOutput, repromptText, suggestions);
              } else if (app.getIntent() === 'PlayAudio' && searchByCity === '') {
                for (let i = 0; i < result['response']['docs'].length; i++) {
                  CityList.push(result['response']['docs'][i]['coverage']);
                }

                CityList = unique(CityList);
                CityList = CityList.sort();
                for (let i = 0; i < CityList.length; i++) {
                  CityString = CityString + CityList[i] + ', ';
                }

                let cardTitle = 'Please Select City.';
                let repromptText = '<speak> Waiting for your response.</speak>';
                let speechOutput = '<speak>Ok, for ' + searchByYear + ' I have music from ' + CityString + ' Please select a city.</speak> ';
                log('Ok , available cities for artist: ' + searchByCollectionValue + ' and year: ' + searchByYear + ' are ' + CityString, searchByCollectionValue, searchByCity, searchByYear, APIURL, function (status) {
                });
                suggestions = CityList;
                askWithReprompt(app, speechOutput, repromptText, suggestions);
              }
            } else if ((app.getIntent() === 'PlayAudioByYearCity') || (searchByCity !== '' && searchByYear !== '')) {
              if (app.getIntent() === 'PlayAudioByYearCity' || currentSearchPage === 0) {
                counter = 0;
                playlist = [];
              }
              if (result['response']['numFound'] < strange_variable_IdentifierCount) {
                strange_variable_used = true;
              } else {
                strange_variable_IdentifierCount++;
              }
              // New Https Request for mp3 tracks
              // track=counter+1;
              let APIURLIDENTIFIER = APIURLIdentifier + result['response']['docs'][0]['identifier'] + '/files';
              APIURLIDENTIFIER = customEncodeUri(APIURLIDENTIFIER);
              let optionsIdentifier = {
                host: ARCHIVE_HOST,
                path: APIURLIDENTIFIER,
                method: 'GET',
                headers: {
                  'User-Agent': 'Google_Action_Internet_Archive'
                }
              };

              logger(optionsIdentifier);
              https.get(optionsIdentifier, function (response) {
                let bodyIdentifier = '';
                response.on('data', function (dataIdentifier) {
                  bodyIdentifier += dataIdentifier;
                });

                response.on('end', function () {
                  let resultIdentifier = JSON.parse(bodyIdentifier);
                  if (resultIdentifier !== null && resultIdentifier['result'].length > 0) {
                    let trackNumber = 0;
                    for (let i = 0; i < resultIdentifier['result'].length; i++) {
                      if (resultIdentifier['result'][i]['format'] === 'VBR MP3') {
                        if (resultIdentifier['result'][i]['searchByTrackTitle'] === undefined) {
                          trackNumber = trackNumber + 1;
                          playlist.push({
                            identifier: result['response']['docs'][0]['identifier'],
                            trackName: resultIdentifier['result'][i]['name'],
                            title: 'Track Number ' + trackNumber,
                            coverage: (result['response']['docs'][0]['coverage']) ? result['response']['docs'][0]['coverage'] : 'Coverage Not mentioned',
                            year: (result['response']['docs'][0]['searchByYear']) ? result['response']['docs'][0]['searchByYear'] : 'Year Not mentioned'
                          });
                        } else {
                          resultIdentifier['result'][i]['searchByTrackTitle'] = resultIdentifier['result'][i]['searchByTrackTitle'].replace(/[^a-zA-Z0-9 ]/g, '');
                          trackNumber = trackNumber + 1;
                          playlist.push({
                            identifier: result['response']['docs'][0]['identifier'],
                            trackName: resultIdentifier['result'][i]['name'],
                            title: resultIdentifier['result'][i]['searchByTrackTitle'],
                            coverage: (result['response']['docs'][0]['coverage']) ? result['response']['docs'][0]['coverage'] : 'Coverage Not mentioned',
                            year: (result['response']['docs'][0]['searchByYear']) ? result['response']['docs'][0]['searchByYear'] : 'Year Not mentioned'
                          });
                        }
                        totalTrackNumber++;
                      }
                    }
                    logger('TotalTrack' + totalTrackNumber);
                    // TotalTrack=TotalTrack+playlist.length-1;

                    let trackcounter = counter;
                    if (playAudioByRandomYear === true || playAudioByRandomCity === true || playAudioByRandom === true) {
                      let start = totalTrackNumber - (playlist.length - 1);
                      let end = totalTrackNumber;
                      let x = Math.floor((Math.random() * end) + start);
                      logger('Track - ' + x);
                      logger('Start - ' + start);
                      logger('End - ' + end);
                      trackcounter = x;
                      audioURL = 'https://archive.org/download/' + playlist[x]['identifier'] + '/' + playlist[x]['trackName'];
                      if (playAudioByRandomYear === true) {
                        log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, searchByCity, 'random', APIURL, function (status) {
                        });
                      } else if (playAudioByRandomCity === true) {
                        log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, 'random', searchByYear, APIURL, function (status) {
                        });
                      } else if (playAudioByRandom === true) {
                        log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, 'random', 'random', APIURL, function (status) {
                        });
                      }
                    } else {
                      audioURL = 'https://archive.org/download/' + playlist[counter]['identifier'] + '/' + playlist[counter]['trackName'];
                      log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, searchByCity, searchByYear, APIURL, function (status) {
                      });
                    }

                    if ((app.getIntent() === actions.mediaStateInput) && (app.getArgument('MEDIA_STATUS').extension.status === app.Media.Status.FINISHED)) {
                      logger(actions.mediaStateInput);
                      askAudio(app, playlist[trackcounter]['identifier'], track, playlist[trackcounter]['searchByTrackTitle'], playlist[trackcounter]['coverage'], playlist[trackcounter]['searchByYear'], audioURL, suggestions);
                    } else {
                      logger('audio url : ' + audioURL);
                      askAudio(app, playlist[trackcounter]['identifier'], track, playlist[trackcounter]['searchByTrackTitle'], playlist[trackcounter]['coverage'], playlist[trackcounter]['searchByYear'], audioURL, suggestions);
                    }
                  } else {
                    let cardTitle = 'No Songs Found';
                    let repromptText = "<speak>Sorry, I couldn't find any songs. Please try a different city and year, or say random.</speak>";
                    let speechOutput = "<speak>Sorry, I couldn't find any songs. Please try a different city and year, or say random.</speak>";
                    askWithReprompt(app, speechOutput, repromptText, suggestions);
                  }
                });
              }).on('error', function (e) {
                let cardTitle = 'Unable to understand your request. ';
                let repromptText = '<speak>Waiting for your response.</speak>';
                let speechOutput = '<speak>Sorry, could you repeat that?</speak>';
                askWithReprompt(app, speechOutput, repromptText, suggestions);
              });
            } else if (app.getIntent() === 'PlayAudioQuery' || searchByTitle) {
              if (app.getIntent() === 'PlayAudioQuery') {
                counter = 0;
                playlist = [];
                track = counter + 1;
              }

              for (let i = 0; i < result['response']['docs'].length; i++) {
                playlist.push({
                  identifier: result['response']['docs'][i]['identifier'],
                  trackName: playlist[counter]['identifier'] + '_vbr.m3u',
                  title: result['response']['docs'][i]['searchByTrackTitle'],
                  coverage: (result['response']['docs'][i]['coverage']) ? result['response']['docs'][i]['coverage'] : 'Coverage Not mentioned',
                  year: (result['response']['docs'][i]['searchByYear']) ? result['response']['docs'][i]['searchByYear'] : 'Year Not mentioned'
                });
              }

              log('Result for search ' + searchByTrackTitle, searchByCollectionValue, null, null, APIURL, function (status) {
              });
              let trackcounter = counter;
              if (playAudioByRandomYear === true || playAudioByRandomCity === true || playAudioByRandom === true) {
                let start = currentSearchPage * 50;
                let end = (currentSearchPage * 50) + playlist.length - 1;
                let x = Math.floor((Math.random() * end) + start);
                logger('Track - ' + x);
                logger('Start - ' + start);
                logger('End - ' + end);
                trackcounter = x;
                audioURL = 'https://archive.org/download/' + playlist[counter]['identifier'] + '/' + playlist[counter]['trackName'];
                if (playAudioByRandomYear === true) {
                  log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, searchByCity, 'random', APIURL, function (status) {
                  });
                } else if (playAudioByRandomCity === true) {
                  log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, 'random', searchByYear, APIURL, function (status) {
                  });
                } else if (playAudioByRandom === true) {
                  log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, 'random', 'random', APIURL, function (status) {
                  });
                }
              } else {
                audioURL = 'https://archive.org/download/' + playlist[counter]['identifier'] + '/' + playlist[counter]['trackName'];
                log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, searchByCity, searchByYear, APIURL, function (status) {
                });
              }

              if ((app.getIntent() === actions.mediaStateInput) && (app.getArgument('MEDIA_STATUS').extension.status === app.Media.Status.FINISHED)) {
                askAudio(app, playlist[trackcounter]['identifier'], track, playlist[trackcounter]['searchByTrackTitle'], playlist[trackcounter]['coverage'], playlist[trackcounter]['searchByYear'], audioURL, suggestions);
              } else {
                askAudio(app, playlist[trackcounter]['identifier'], track, playlist[trackcounter]['searchByTrackTitle'], playlist[trackcounter]['coverage'], playlist[trackcounter]['searchByYear'], audioURL, suggestions);
              }
            } else if (app.getIntent() === 'PlayAudioByRandomYear' || playAudioByRandomYear) {
              if (app.getIntent() === 'PlayAudioByRandomYear') {
                counter = 0;
                playlist = [];
                track = counter + 1;
              }

              let APIURLIDENTIFIER = APIURLIdentifier + result['response']['docs'][0]['identifier'] + '/files';
              APIURLIDENTIFIER = customEncodeUri(APIURLIDENTIFIER);
              let optionsIdentifier = {
                host: ARCHIVE_HOST,
                path: APIURLIDENTIFIER,
                method: 'GET',
                headers: {
                  'User-Agent': 'Google_Action_Internet_Archive'
                }
              };

              https.get(optionsIdentifier, function (response) {
                let bodyIdentifier = '';
                response.on('data', function (dataIdentifier) {
                  bodyIdentifier += dataIdentifier;
                });

                response.on('end', function () {
                  let resultIdentifier = JSON.parse(bodyIdentifier);
                  if (resultIdentifier !== null && resultIdentifier['result'].length > 0) {
                    let trackNumber = 0;
                    for (let i = 0; i < resultIdentifier['result'].length; i++) {
                      if (resultIdentifier['result'][i]['format'] === 'VBR MP3') {
                        if (resultIdentifier['result'][i]['searchByTrackTitle'] === undefined) {
                          trackNumber = trackNumber + 1;
                          playlist.push({
                            identifier: result['response']['docs'][0]['identifier'],
                            trackName: resultIdentifier['result'][i]['name'],
                            title: 'Track Number ' + trackNumber,
                            coverage: (result['response']['docs'][0]['coverage']) ? result['response']['docs'][0]['coverage'] : 'Coverage Not mentioned',
                            year: (result['response']['docs'][0]['searchByYear']) ? result['response']['docs'][0]['searchByYear'] : 'Year Not mentioned'
                          });
                        } else {
                          trackNumber = trackNumber + 1;
                          resultIdentifier['result'][i]['searchByTrackTitle'] = resultIdentifier['result'][i]['searchByTrackTitle'].replace(/[^a-zA-Z0-9 ]/g, '');
                          playlist.push({
                            identifier: result['response']['docs'][0]['identifier'],
                            trackName: resultIdentifier['result'][i]['name'],
                            title: resultIdentifier['result'][i]['searchByTrackTitle'],
                            coverage: (result['response']['docs'][0]['coverage']) ? result['response']['docs'][0]['coverage'] : 'Coverage Not mentioned',
                            year: (result['response']['docs'][0]['searchByYear']) ? result['response']['docs'][0]['searchByYear'] : 'Year Not mentioned'
                          });
                        }
                        totalTrackNumber++;
                      }
                    }
                    //   TotalTrack=TotalTrack+playlist.length-1;

                    let trackcounter = counter;
                    if (playAudioByRandomYear === true || playAudioByRandomCity === true || playAudioByRandom === true) {
                      let start = totalTrackNumber - (playlist.length - 1);
                      let end = totalTrackNumber;
                      let x = Math.floor((Math.random() * end) + start);
                      logger('Track - ' + x);
                      logger('Start - ' + start);
                      logger('End - ' + end);
                      trackcounter = x;
                      audioURL = 'https://archive.org/download/' + playlist[x]['identifier'] + '/' + playlist[x]['trackName'];
                      if (playAudioByRandomYear === true) {
                        log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, searchByCity, 'random', APIURL, function (status) {
                        });
                      } else if (playAudioByRandomCity === true) {
                        log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, 'random', searchByYear, APIURL, function (status) {
                        });
                      } else if (playAudioByRandom === true) {
                        log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, 'random', 'random', APIURL, function (status) {
                        });
                      }
                    } else {
                      audioURL = 'https://archive.org/download/' + playlist[counter]['identifier'] + '/' + playlist[counter]['trackName'];
                      log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, searchByCity, searchByYear, APIURL, function (status) {
                      });
                    }

                    if ((app.getIntent() === actions.mediaStateInput) && (app.getArgument('MEDIA_STATUS').extension.status === app.Media.Status.FINISHED)) {
                      askAudio(app, playlist[trackcounter]['identifier'], track, playlist[trackcounter]['searchByTrackTitle'], playlist[trackcounter]['coverage'], playlist[trackcounter]['searchByYear'], audioURL, suggestions);
                    } else {
                      askAudio(app, playlist[trackcounter]['identifier'], track, playlist[trackcounter]['searchByTrackTitle'], playlist[trackcounter]['coverage'], playlist[trackcounter]['searchByYear'], audioURL, suggestions);
                    }
                  } else {
                    let trackcounter = counter;
                    let cardTitle = 'No Songs Found';
                    let repromptText = "<speak>Sorry, I couldn't find any songs. Please try a different city or year, or say random.</speak>";
                    let speechOutput = "<speak>Sorry, I couldn't find any songs. Please try a different city or year, or say random.</speak>";
                    askAudio(app, playlist[trackcounter]['identifier'], track, playlist[trackcounter]['searchByTrackTitle'], playlist[trackcounter]['coverage'], playlist[trackcounter]['searchByYear'], audioURL, suggestions);
                  }
                });
              }).on('error', function (e) {
                let cardTitle = 'Unable to understand your request.';
                let repromptText = '<speak>Sorry, could you repeat that?</speak>';
                let speechOutput = '<speak>Sorry, could you repeat that?</speak>';
                askWithReprompt(app, speechOutput, repromptText, suggestions);
              });
            } else if (app.getIntent() === 'PlayAudioByRandomCity' || playAudioByRandomYear) {
              if (app.getIntent() === 'PlayAudioByRandomCity') {
                counter = 0;
                playlist = [];
                track = counter + 1;
              }

              let APIURLIDENTIFIER = APIURLIdentifier + result['response']['docs'][0]['identifier'] + '/files';
              APIURLIDENTIFIER = customEncodeUri(APIURLIDENTIFIER);
              let optionsIdentifier = {
                host: ARCHIVE_HOST,
                path: APIURLIDENTIFIER,
                method: 'GET',
                headers: {
                  'User-Agent': 'Google_Action_Internet_Archive'
                }
              };

              https.get(optionsIdentifier, function (response) {
                let bodyIdentifier = '';
                response.on('data', function (dataIdentifier) {
                  bodyIdentifier += dataIdentifier;
                });

                response.on('end', function () {
                  let resultIdentifier = JSON.parse(bodyIdentifier);
                  if (resultIdentifier !== null && resultIdentifier['result'].length > 0) {
                    let trackNumber = 0;
                    for (let i = 0; i < resultIdentifier['result'].length; i++) {
                      if (resultIdentifier['result'][i]['format'] === 'VBR MP3') {
                        if (resultIdentifier['result'][i]['searchByTrackTitle'] === undefined) {
                          trackNumber = trackNumber + 1;
                          playlist.push({
                            identifier: result['response']['docs'][0]['identifier'],
                            trackName: resultIdentifier['result'][i]['name'],
                            title: 'Track Number ' + trackNumber,
                            coverage: (result['response']['docs'][0]['coverage']) ? result['response']['docs'][0]['coverage'] : 'Coverage Not mentioned',
                            year: (result['response']['docs'][0]['searchByYear']) ? result['response']['docs'][0]['searchByYear'] : 'Year Not mentioned'
                          });
                        } else {
                          trackNumber = trackNumber + 1;
                          resultIdentifier['result'][i]['searchByTrackTitle'] = resultIdentifier['result'][i]['searchByTrackTitle'].replace(/[^a-zA-Z0-9 ]/g, '');
                          playlist.push({
                            identifier: result['response']['docs'][0]['identifier'],
                            trackName: resultIdentifier['result'][i]['name'],
                            title: resultIdentifier['result'][i]['searchByTrackTitle'],
                            coverage: (result['response']['docs'][0]['coverage']) ? result['response']['docs'][0]['coverage'] : 'Coverage Not mentioned',
                            year: (result['response']['docs'][0]['searchByYear']) ? result['response']['docs'][0]['searchByYear'] : 'Year Not mentioned'
                          });
                        }
                        totalTrackNumber++;
                      }
                    }
                    // TotalTrack=TotalTrack+playlist.length-1;

                    let trackcounter = counter;
                    if (playAudioByRandomYear === true || playAudioByRandomCity === true || playAudioByRandom === true) {
                      let start = totalTrackNumber - (playlist.length - 1);
                      let end = totalTrackNumber;
                      let x = Math.floor((Math.random() * end) + start);
                      logger('Track - ' + x);
                      logger('Start - ' + start);
                      logger('End - ' + end);
                      trackcounter = x;
                      audioURL = 'https://archive.org/download/' + playlist[x]['identifier'] + '/' + playlist[x]['trackName'];
                      if (playAudioByRandomYear === true) {
                        log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, searchByCity, 'random', APIURL, function (status) {
                        });
                      } else if (playAudioByRandomCity === true) {
                        log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, 'random', searchByYear, APIURL, function (status) {
                        });
                      } else if (playAudioByRandom === true) {
                        log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, 'random', 'random', APIURL, function (status) {
                        });
                      }
                    } else {
                      audioURL = 'https://archive.org/download/' + playlist[counter]['identifier'] + '/' + playlist[counter]['trackName'];
                      log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, searchByCity, searchByYear, APIURL, function (status) {
                      });
                    }

                    if ((app.getIntent() === actions.mediaStateInput) && (app.getArgument('MEDIA_STATUS').extension.status === app.Media.Status.FINISHED)) {
                      askAudio(app, playlist[trackcounter]['identifier'], track, playlist[trackcounter]['searchByTrackTitle'], playlist[trackcounter]['coverage'], playlist[trackcounter]['searchByYear'], audioURL, suggestions);
                    } else {
                      askAudio(app, playlist[trackcounter]['identifier'], track, playlist[trackcounter]['searchByTrackTitle'], playlist[trackcounter]['coverage'], playlist[trackcounter]['searchByYear'], audioURL, suggestions);
                    }
                  } else {
                    let cardTitle = 'No Songs Found';
                    let repromptText = "<speak>Sorry, I couldn't find any songs. Please try a different city or year, or say random.</speak>";
                    let speechOutput = "<speak>Sorry, I couldn't find any songs. Please try a different city or year, or say random.</speak>";
                    askWithReprompt(app, speechOutput, repromptText, suggestions);
                  }
                });
              }).on('error', function (e) {
                let cardTitle = 'Unable to understand your request.';
                let repromptText = '<speak>Sorry, can you repeat that?</speak>';
                let speechOutput = '<speak>Sorry, can you repeat that?</speak>';
                askWithReprompt(app, speechOutput, repromptText, suggestions);
              });
            } else if (app.getIntent() === 'PlayAudioByRandom' || playAudioByRandom) {
              if (app.getIntent() === 'PlayAudioByRandom') {
                counter = 0;
                playlist = [];
                track = counter + 1;
              }

              let APIURLIDENTIFIER = APIURLIdentifier + result['response']['docs'][0]['identifier'] + '/files';
              APIURLIDENTIFIER = customEncodeUri(APIURLIDENTIFIER);
              let optionsIdentifier = {
                host: ARCHIVE_HOST,
                path: APIURLIDENTIFIER,
                method: 'GET',
                headers: {
                  'User-Agent': 'Google_Action_Internet_Archive'
                }
              };

              https.get(optionsIdentifier, function (response) {
                let bodyIdentifier = '';
                response.on('data', function (dataIdentifier) {
                  bodyIdentifier += dataIdentifier;
                });

                response.on('end', function () {
                  let resultIdentifier = JSON.parse(bodyIdentifier);
                  if (resultIdentifier !== null && resultIdentifier['result'].length > 0) {
                    let trackNumber = 0;
                    for (let i = 0; i < resultIdentifier['result'].length; i++) {
                      if (resultIdentifier['result'][i]['format'] === 'VBR MP3') {
                        if (resultIdentifier['result'][i]['searchByTrackTitle'] === undefined) {
                          trackNumber = trackNumber + 1;
                          playlist.push({
                            identifier: result['response']['docs'][0]['identifier'],
                            trackName: resultIdentifier['result'][i]['name'],
                            title: 'Track Number ' + trackNumber,
                            coverage: (result['response']['docs'][0]['coverage']) ? result['response']['docs'][0]['coverage'] : 'Coverage Not mentioned',
                            year: (result['response']['docs'][0]['searchByYear']) ? result['response']['docs'][0]['searchByYear'] : 'Year Not mentioned'
                          });
                        } else {
                          trackNumber = trackNumber + 1;
                          resultIdentifier['result'][i]['searchByTrackTitle'] = resultIdentifier['result'][i]['searchByTrackTitle'].replace(/[^a-zA-Z0-9 ]/g, '');
                          playlist.push({
                            identifier: result['response']['docs'][0]['identifier'],
                            trackName: resultIdentifier['result'][i]['name'],
                            title: resultIdentifier['result'][i]['searchByTrackTitle'],
                            coverage: (result['response']['docs'][0]['coverage']) ? result['response']['docs'][0]['coverage'] : 'Coverage Not mentioned',
                            year: (result['response']['docs'][0]['searchByYear']) ? result['response']['docs'][0]['searchByYear'] : 'Year Not mentioned'
                          });
                        }
                        totalTrackNumber++;
                      }
                    }
                    // TotalTrack=TotalTrack+playlist.length-1;
                    // logger('TrackCount -'+TotalTrack);
                    // logger('Array Size -'+playlist.length);
                    let trackcounter = counter;
                    if (playAudioByRandomYear === true || playAudioByRandomCity === true || playAudioByRandom === true) {
                      let start = totalTrackNumber - (playlist.length - 1);
                      let end = totalTrackNumber;
                      let x = Math.floor((Math.random() * end) + start);
                      logger('Track - ' + x);
                      logger('Start - ' + start);
                      logger('End - ' + end);
                      trackcounter = x;
                      audioURL = 'https://archive.org/download/' + playlist[x]['identifier'] + '/' + playlist[x]['trackName'];
                      if (playAudioByRandomYear === true) {
                        log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, searchByCity, 'random', APIURL, function (status) {
                        });
                      } else if (playAudioByRandomCity === true) {
                        log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, 'random', searchByYear, APIURL, function (status) {
                        });
                      } else if (playAudioByRandom === true) {
                        log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, 'random', 'random', APIURL, function (status) {
                        });
                      }
                    } else {
                      audioURL = 'https://archive.org/download/' + playlist[counter]['identifier'] + '/' + playlist[counter]['trackName'];
                      log('Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, searchByCity, searchByYear, APIURL, function (status) {
                      });
                    }

                    if ((app.getIntent() === actions.mediaStateInput) && (app.getArgument('MEDIA_STATUS').extension.status === app.Media.Status.FINISHED)) {
                      askAudio(app, playlist[trackcounter]['identifier'], track, playlist[trackcounter]['searchByTrackTitle'], playlist[trackcounter]['coverage'], playlist[trackcounter]['searchByYear'], audioURL, suggestions);
                    } else {
                      askAudio(app, playlist[trackcounter]['identifier'], track, playlist[trackcounter]['searchByTrackTitle'], playlist[trackcounter]['coverage'], playlist[trackcounter]['searchByYear'], audioURL, suggestions);
                    }
                  } else {
                    let cardTitle = 'No Songs Found';
                    let repromptText = "<speak>Sorry, I couldn't find any songs. Please try a different city or year, or say random.</speak>";
                    let speechOutput = "<speak>Sorry, I couldn't find any songs. Please try a different city or year, or say random.</speak>";

                    askWithReprompt(app, speechOutput, repromptText, suggestions);
                  }
                });
              }).on('error', function (e) {
                let cardTitle = 'Unable to understand your request.';
                let repromptText = '<speak>Sorry, can you say that again?</speak>';
                let speechOutput = '<speak>Sorry, can you say that again?</speak>';
                askWithReprompt(app, speechOutput, repromptText, suggestions);
              });
            }
          } else {
            if (playAudioByRandom) {
              log('Sorry , No result found for command play ' + searchByCollectionValue + ' random  ', searchByCollectionValue, 'random', 'random', APIURL, function (status) {
              });
            } else {
              log('Sorry , No result found for command play ' + searchByCollectionValue + ' ' + searchByCity + ' ' + searchByYear + '   ', searchByCollectionValue, searchByCity, searchByYear, APIURL, function (status) {
              });
            }

            let cardTitle = 'No Songs Found';
            let repromptText = "<speak>Sorry, I couldn't find any songs. Please try a different city or year, or say random.</speak>";
            let speechOutput = checkYear(searchByYear);
            if (speechOutput === '') {
              speechOutput = "<speak>Sorry, I couldn't find any songs. Please try a different city or year, or say random.</speak>";
            }
            // year = '';
            // city = '';
            askWithReprompt(app, speechOutput, repromptText, suggestions);
          }
        });
      }).on('error', function (e) {
        searchByYear = '';
        searchByCity = '';
        let cardTitle = 'Unable to understand your request.';
        let repromptText = '<speak>Sorry, can you say that again?</speak>';
        let speechOutput = '<speak>Sorry, can you say that again?</speak>';
        askWithReprompt(app, speechOutput, repromptText, suggestions);
      });
    } else {
      let cardTitle = 'Unable to understand your request.';
      let repromptText = '<speak>Sorry, can you say that again?</speak>';
      let speechOutput = '<speak>Sorry, can you say that again?</speak>';

      askWithReprompt(app, speechOutput, repromptText, suggestions);
    }
  } else {
    let cardTitle = 'Please select artist';
    let repromptText = "<speak>Please say an artist name.<break time='.1s'/> Like The Ditty Bops,<break time='.1s'/> Or Cowboy Junkies,<break time='.1s'/> or Grateful Dead.</speak>";
    let speechOutput = "<speak>Please say an artist name.<break time='.1s'/> Like The Ditty Bops,<break time='.1s'/> Or Cowboy Junkies,<break time='.1s'/> or Grateful Dead.</speak>";

    askWithReprompt(app, speechOutput, repromptText, suggestions);
  }
}

function checkYear (year) {
  let speechOutput = '';
  if (availableYears.length > 0 && availableYears.indexOf(year) < 0) {
    let tempYearList = [];
    tempYearList.push(availableYears);
    tempYearList.push(year);
    tempYearList = unique(tempYearList);
    tempYearList = tempYearList.sort();
    let yearIndex = tempYearList.indexOf(year);
    // speechOutput = tempYearList;
    logger('yearIndex : ' + yearIndex);
    logger('tempYearList : ' + tempYearList);
    if (yearIndex > 0 && yearIndex < tempYearList.length - 1) {
      speechOutput = '<speak> I don’t have anything for ' + year + '. The two closest years for ' + searchByCity + '. I would have are in ' + tempYearList[yearIndex - 1] + ' or ' + tempYearList[yearIndex + 1] + '. Which year would you like? </speak>';
    } else if (yearIndex === 0 || yearIndex === tempYearList.length - 1) {
      speechOutput = '<speak> I don’t have anything for ' + year + '. Please select within suggested range. </speak>';
      let YearString = '';
      if (availableYears.length === 1) {
        YearString = availableYears[0];
        speechOutput = '<speak> I don’t have anything for ' + year + '. Available year for ' + searchByCity + ' is ' + YearString + '.</speak>';
      } else if (availableYears.length > 1) {
        YearString = availableYears[0] + ' to ' + availableYears[availableYears.length - 1];
        speechOutput = '<speak> I don’t have anything for ' + year + '. Available years for ' + searchByCity + ' are ' + YearString + '.</speak>';
      }
    }
  }
  return speechOutput;
}

function handleSessionEndRequest (app) {
  let cardTitle = 'Good bye';
  let speechOutput = '<speak>Thanks for rocking with the Internet Archive’s live music collection!</speak>';
  let repromptText = '<speak>Thanks for rocking with the Internet Archive’s live music collection!</speak>';
  askWithReprompt(app, speechOutput, repromptText, suggestions);
}

function log (Title, Collection, City, Year, Url, callback) {
  let url = 'http://alexa.appunison.in:5557/admin/savelog?identifierName=' + Collection + '&title=' + Title + '&city=' + City + '&year=' + Year + '&url=' + Url + '&resltJson=null';
  logger(url);
}

function log1 (Title, Collection, City, Year, Url, callback) {
  let url = 'http://alexa.appunison.in:5557/admin/savelog?identifierName=' + Collection + '&title=' + Title + '&city=' + City + '&year=' + Year + '&url=' + Url + '&resltJson=null';
  logger(url);
  http.get(url, function (res) {
    let body = '';
    res.on('data', function (data) {
      body += data;
    });
    res.on('end', function () {
      callback();
    });
  }).on('error', function (e) {
    callback(null, e);
  });
}

function Discovery (app) {
  let cardTitle = 'Discover more';
  let repromptText = "<speak>Waiting for your response.<break time='.5s'/> What artist would you like to listen to? <break time='.5s'/> Like , Disco Biscuits, Hot Buttered Rum, or Keller Williams.</speak>";
  // let speechOutput = "<speak>Welcome To The Internet Archive,<break time='1s'/> Please select a collection by saying<break time='.5s'/> play Collection name.<break time='.5s'/> like Play The Ditty Bops,<break time='.5s'/> Or Play Cowboy Junkies.<break time='.5s'/> Or Play Grateful Dead.</speak>";
  let cardOutput = 'We have more collection like Disco Biscuits, Hot Buttered Rum or Keller Williams.';
  let speechOutput = '<speak>We have more collections like Disco Biscuits, Hot Buttered Rum, or Keller Williams.</speak>';
  suggestions = ['Disco Biscuits', 'Hot Buttered Rum', 'Keller Williams'];
  askWithReprompt(app, speechOutput, repromptText, suggestions);
}

function OneGoPlayAudio (app, offsetInMilliseconds) {
  getOneGoPlayAudio(app, currentTrackIdx, this, offsetInMilliseconds, function (err, Obj, response) {
    if (!err) {
      Obj.context.succeed(response);
    } else {
      Obj.context.succeed(response);
    }
  });
}

function play (app, offsetInMilliseconds) {
  getAudioPlayList(app, currentTrackIdx, this, offsetInMilliseconds, function (err, Obj, response) {
    if (!err) {
      logger('!Error : ' + response);
    } else {
      logger('Error : ' + response);
    }
  });
}

function tell (app, speechOutput) {
  app.tell(app.buildRichResponse()
    .addSimpleResponse(speechOutput));
}

function askWithReprompt (app, speechOutput, repromptText, suggestions) {
  currentRepromptText = repromptText;
  ask(app, speechOutput, suggestions);
}

function ask (app, speechOutput, suggestions) {
  if (speechOutput !== currentSpeechoutput) {
    previousSpeechoutput = currentSpeechoutput;
    previousSuggestions = currentSuggestions;
    currentSpeechoutput = speechOutput;
    currentSuggestions = suggestions;
  }
  app.ask(app.buildRichResponse()
    .addSimpleResponse(speechOutput)
    .addSuggestions(suggestions));
}

function askAudioWithoutCoverageYear (app, identifier, track, title, coverage, year, audioURL, suggestions) {
  logger('Current Song Without Coverage : ' + currentTrackIdx + '/' + playlist.length);
  previousSpeechoutput = currentSpeechoutput;
  previousSuggestions = currentSuggestions;
  currentSpeechoutput = null;
  currentSuggestions = null;

  logger('audioURL : ' + audioURL);

  app.ask(app.buildRichResponse()
    .addSimpleResponse('Playing track - ' + title)
    .addMediaResponse(app.buildMediaResponse()
      .addMediaObjects([app.buildMediaObject('Playing track number - ' + track, audioURL)
        .setDescription('Playing track - ' + title)
        // .setImage(imageURL+replaceall(" ", "", collection), app.Media.ImageType.LARGE)
        // .setImage(imageURL+identifier, app.Media.ImageType.LARGE)
        .setImage('http://archive.org/images/notfound.png', app.Media.ImageType.LARGE)
        // .setImage("https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Internet_Archive_logo_and_wordmark.svg/1200px-Internet_Archive_logo_and_wordmark.svg.png", app.Media.ImageType.SMALL)
      ])
    ).addSuggestions(suggestions)
    .addSuggestionLink('on Archive.org', audioURL));
}

function askAudio (app, identifier, track, title, coverage, year, audioURL, suggestions) {
  logger('Current Song With Coverage : ' + currentTrackIdx + '/' + playlist.length);
  previousSpeechoutput = currentSpeechoutput;
  previousSuggestions = currentSuggestions;
  currentSpeechoutput = null;
  currentSuggestions = null;

  logger('audioURL : ' + audioURL);

  // To Log Request to Kibana
  logKibana(function (status) {
  });

  app.ask(app.buildRichResponse()
    .addSimpleResponse('Playing track - ' + title + ', ' + coverage + ', ' + year)
    .addMediaResponse(app.buildMediaResponse()
      .addMediaObjects([app.buildMediaObject('Playing track number - ' + track, audioURL)
        .setDescription('Playing track - ' + title + ', ' + coverage + ', ' + year)
        // .setImage(imageURL+identifier, app.Media.ImageType.LARGE)
        .setImage('http://archive.org/images/notfound.png', app.Media.ImageType.LARGE)
        //  .setImage("https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Internet_Archive_logo_and_wordmark.svg/1200px-Internet_Archive_logo_and_wordmark.svg.png", app.Media.ImageType.SMALL)
      ])
    ).addSuggestions(suggestions)
    .addSuggestionLink('on Archive.org', audioURL));
}

function PlayNextSong (app, requestType, offsetInMilliseconds) {
  let track = currentTrackIdx + 1;
  let prevTrack = currentTrackIdx;
  if (playlist.length > 0) {
    if (track > playlist.length) {
      currentTrackIdx = 0;
      track = currentTrackIdx + 1;
    }
    let trackcounter = currentTrackIdx;
    if (playAudioByRandomYear === true || playAudioByRandomCity === true || playAudioByRandom === true) {
      let start = totalTrackNumber - (playlist.length - 1);
      let end = totalTrackNumber;
      let x = Math.floor((Math.random() * end) + start);
      logger('Track - ' + x);
      logger('Start - ' + start);
      logger('End - ' + end);
      trackcounter = x;
      audioURL = 'https://archive.org/download/' + playlist[x]['identifier'] + '/' + playlist[x]['trackName'];
      if (playAudioByRandomYear === true) {
        log('Auto Next Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, searchByCity, 'random', APIURL, function (status) {
        });
      } else if (playAudioByRandomCity === true) {
        log('PAuto Next laying Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, 'random', searchByYear, APIURL, function (status) {
        });
      } else if (playAudioByRandom === true) {
        log('Auto Next Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, 'random', 'random', APIURL, function (status) {
        });
      }
    } else {
      audioURL = 'https://archive.org/download/' + playlist[currentTrackIdx]['identifier'] + '/' + playlist[currentTrackIdx]['trackName'];
      log('Auto Next Playing Track URL - ' + audioURL + ' And Track Name - ' + playlist[trackcounter]['searchByTrackTitle'], searchByCollectionValue, searchByCity, searchByYear, APIURL, function (status) {
      });
    }
    // logger('Auto Next -'+audioURL);
    askAudio(app, playlist[trackcounter]['identifier'], track, playlist[trackcounter]['searchByTrackTitle'], playlist[trackcounter]['coverage'], playlist[trackcounter]['searchByYear'], audioURL, suggestions);
  } else {
    logger('Auto Next - Not Found');
    let cardTitle = 'Unable to understand your request.';
    let repromptText = '<speak>Sorry, can you say that again?</speak>';
    let speechOutput = '<speak>Sorry, can you say that again?</speak>';

    askWithReprompt(app, speechOutput, repromptText, suggestions);
  }
}

function logKibana (callback) {
  // To Log Request to Kibana
  let options = {
    host: ARCHIVE_HOST,
    path: APIURL,
    method: 'GET',
    headers: {
      'User-Agent': 'Google_Action_Internet_Archive'
    }
  };
  https.get(options, function (res) {
    let body = '';
    res.on('data', function (data) {
      body += data;
    });
    res.on('end', function () {
      callback();
    });
  }).on('error', function (e) {
    callback(null, e);
  });
  // To Log Request to Kibana
}
