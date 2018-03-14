const mustache = require('mustache');

const dialog = require('../dialog');
const versionStrings = require('../strings').intents.version;
const {getLastReprompt, getLastSuggestions} = require('../state/dialog');

let packageJSON = require('../package.json');

/**
 * handle version intent
 *
 * @param app
 */
function handler (app) {
  let reprompt = getLastReprompt(app);
  let speech = mustache.render(versionStrings.speech, {version: packageJSON.version});
  let suggestions = getLastSuggestions(app);

  dialog.ask(app, {speech, reprompt, suggestions});
}

module.exports = {
  handler,
};
