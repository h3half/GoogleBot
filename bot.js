// Initialize objects
const Discord = require("discord.js");
const fs = require("fs");
const request = require("sync-request");
const { start } = require("repl");
const WolframAlphaAPI = require("wolfram-alpha-api");

var mentionString1 = "";
var mentionString2 = "";
var config = "";
var wa_key = "";

// Initialize bot
var bot = new Discord.Client();

try {
    const auth = require("./auth.json");
    bot.login(auth.token);
    wa_key = auth.wa;
} catch {
    authtoken = process.env.AUTH_TOKEN;
    wa_key = process.env.WA_API
    bot.login(authtoken);
}

// Fires when unhandled promise rejections occur
process.on('unhandledRejection', (error, p) => {
  console.log('=== UNHANDLED REJECTION ===');
  console.dir(error.stack);
});

// Fires when bot connects
bot.on("ready", () => {
    // Set mentionStrings
    mentionString1 = "<@!" + bot.user + ">"
    mentionString2 = "<@" + bot.user + ">"

    // Record time and log connection in console
    const reconnectTime = new Date(Date.now());
    console.log(`Connected as ${bot.user.username} (id ${bot.user}) on ${reconnectTime.toUTCString()}`);

    // Load config
    let rawConfig = fs.readFileSync("config.json");
    config = JSON.parse(rawConfig);

    // Optionally notify server of connection
    if (config.notify_connection) {
        bot.channels.cache.get('525521991424278529').send('Connected')
    }
});

// Fires when a message is received
bot.on("message", message => {
    //TODO: Actually fully sanitize down to some smaller unicode set
    let mention = message.mentions.users.first();

    // Sanitize inputs
    let content = message.content.replace("’", "");
    
    // If the message starts with either the real bot mention string or the nicknam bot mention string
    if (mention == bot.user) {
        // Parse out the mentionString
        commandString = content.substring(content.search(" ") + 1);
        console.log(`Recieved command: ${commandString}`);

        // Handle commands
        if (commandString.startsWith("!")) {
            console.log("Handling command: " + content);
            commandParser(content, message);
        
        // Handle image searching
        } else if (commandString.startsWith("image ") || commandString.startsWith("images ") || commandString.startsWith("picture ") || commandString.startsWith("pictures ")) {
            console.log("Image searching: " + content);
            imageSearch(content, message);

        // Handle link searching
        } else {
            console.log("Link searching: " + content);
            linkSearch(content, message);

        }

    // Bespoke, message-specific responses
    } else if (config.spam) {
        if (content == "How was your run?") {
            sendMessage("I just got back from my run", message);
        } else if (content == "69") {
            sendMessage("Nice", message);
        }
    
    // Responses for if a message contains specific text
    } else if (config.emojispam) {
        if (content.toLowerCase().search("good bot") != -1) {
            message.react("🤖");
        } else if (content.toLowerCase().search("reee") != -1) {
            message.react("👿");
        } else if (content.toLowerCase().search("george russell") != -1) {
            message.react("❤");
        } else if (content.toLowerCase().search("elon") != -1 || content.toLowerCase().search("musk") != -1 || content.toLowerCase().search("elomg") != -1) {
            if (config.shortHate) {
                message.react("🤬");
            } else {
                message.react("🇫")
                    .then(() => message.react("🇺"))
                    .then(() => message.react("🇨"))
                    .then(() => message.react("🇰"))
                    .then(() => message.react("🇪"))
                    .then(() => message.react("🇱"))
                    .then(() => message.react("🇴"))
                    .then(() => message.react("🇳"))
                    .catch(() => sendMessage("angry reaction error"));
            }
        } else if (message.author.id == "181967094185852929" && content.toLowerCase().search("store") != -1 ) {
            message.react("🛒");
        }
 
    // Log non-mention messages for debugging
    } else if (config.debug) {
        console.log(`Message '${content}' does not start with mentionString`);
    }
});


// Fires when bot disconnects
bot.on("shardDisconnect", () => {
    const disconnectTime = new Date(Date.now());
    console.log(` `);
    console.log(`Disconnect time: ${disconnectTime.toUTCString()}`);
    console.log(` `);

    bot.login(auth.token);
});

// Parses commands, calls appropriate command-specific functions, and sends the response
function commandParser(content, message) {
    // Parse command
    var words = content.split(" ");
    var command = words[1].substring(1);
    var args = words.slice(2);
    var response = "";

    console.log("Found command '" + command + "' with args '" + args + "'");

    // Call command-specific functions
    switch(command) {
        case "version":
            response = versionCommand(args);
            break;

        case "changelog":
            response = changelogCommand(args);
            break;

        case "config":
            response = configCommand(args);
            break;

        case "roll":
            response = rollCommand(args);
            break;

        case "help":
            response = helpCommand(args);
            break;
        
        case "w":

        case "wa":
            response = wolframCommand(args);
            break;
        
        case "latex":
            response = "<@!646523630309605396> !" + command + " " + args.join(" ");
            break;
        
        case "nhc":
        
        case "noaa":
            response = noaaCommand();
            break;

        case "meme":
            response = memeCommand();
            break;

        default:
            response = "Command \"" + command + "\" not recognized";
    }
    
    // Send response
    if (message != "") {
        sendMessage(response, message);
        console.log("Sent message: " + response);
    }

    return;
}

// Sends result of Google Image search for given query
function imageSearch(content, message) {
    console.log("Performing image search for message: " + content);

    let searchTerm = content.substring(content.search(" ") + 1);

    let imagesToSend = config.image_results;
    if (searchTerm.startsWith("image ") || searchTerm.startsWith("picture ")) {
        imagesToSend = 1;
    }

    // Remove the command
    searchTerm = searchTerm.substring(searchTerm.search(" ") + 1);

    // Remove "of", if present
    if (searchTerm.startsWith("of ")) {
        searchTerm = searchTerm.substring(searchTerm.search(" ") + 1);
    }

    console.log("Searching for images of: " + searchTerm);

    // Retrieve the HTML
    let parsedTerm = searchTerm.replace(" ", "+");
    rawHtml = getHtml(`http://www.google.com/search?q=${parsedTerm}&tbm=isch`);

    // Write the raw HTML to file for debugging/manual inspection
    fs.writeFile("latestSearch.html", rawHtml, function (err) {
        if (err) throw err;
    });

    let response = "";
    for (i = 0; i < imagesToSend; i++) {
        let [thisResponse, responseIdx] = findLinkInHtml(rawHtml, "<img class=\"t0fcAb\"", "&amp;s");
        rawHtml = rawHtml.substring(responseIdx);
        response += thisResponse + "\n";
    }

    // Send response
    sendMessage(response, message);
    console.log("Sent message: " + response);

    return;
}

// Sends result of Google search for given query
function linkSearch (content, message) {
    console.log("Performing link search for message: " + content);

    let searchTerm = content.substring(content.search(" ") + 1);
    console.log("Searching for links of: " + searchTerm);

    // Retrieve the HTML
    let parsedTerm = searchTerm.replace(" ", "+");
    rawHtml = getHtml(`http://www.google.com/search?q=${parsedTerm}`);

    // Write the raw HTML to file for debugging/manual inspection
    fs.writeFile("latestSearch.html", rawHtml, function (err) {
        if (err) throw err;
    });

    let response = "";
    for (i = 0; i < config.text_results; i++) {
        var [thisResponse, responseIdx] = findLinkInHtml(rawHtml, "<div class=\"kCrYT\"><a href=", "&amp;sa=U&amp;");
        rawHtml = rawHtml.substring(responseIdx);
        response += thisResponse + "\n";
    }
    
    // Send response
    sendMessage(response, message);
    console.log("Sent message: " + response);

    return;
}

// Retrieves raw HTML from given URL
function getHtml(url) {
    rawHtml = request("GET", url);

    return rawHtml.getBody("utf8");
}

// Returns contents found between given start and end strings inside the source string
function findinHtml(source, startString, endString) {
    // Find location of first instance of startString
    let startIndex = source.search(startString) + startString.length;

    // Trim the source
    let newSource = source.substring(startIndex);

    // Find location of first instance of endString
    let endIndex = newSource.search(endString);

    // Correct to start of link, in case something came along at the start
    return [newSource.substring(0, endIndex), endIndex + startIndex];
}

function findLinkInHtml(source, startString, endString) {
    let [linkString, nextSearchIdx] = findinHtml(source, startString, endString);

    linkString = linkString.substring(linkString.search("http"));

    try {
        return [decodeURIComponent(linkString), nextSearchIdx];
    } catch(error) {
        return ["Cannot parse URI. Don't search for such silly nonsense.", 0];
    }
}

function versionCommand(args) {

}

function changelogCommand(args) {
    
}

function configCommand(args) {
    let message = "";

    if (args[0] == "-?") {
        //TODO: Call the helpCommand() function {message = helpCommand(args)}
        // return helpCommand(blah blah blah)
    }

    // Integer parsing for text and image results
    if (args[0] == "text_results" || args[0] == "image_results") {
        // Try to parse the given amount
        let potentialResults = parseInt(args[1]);

        // Assign the value if it was valid
        if (!isNaN(potentialResults)) {
            // Clamp the parsed amount if necessary
            if (potentialResults > 10) {
                potentialResults = 10;
            } else if (potentialResults < 1) {
                potentialResults = 1;
            }

            // Set the value
            if (args[0] == "text_results") {
                config.text_results = potentialResults;
            } else if (args[0] == "image_results") {
                config.image_results = potentialResults;
            }

            message = `Changed config item '${args[0]}' to value '${potentialResults}'`;
        } else {
            return `Cannot parse '${args[1]}' for config item '${args[0]}'`;
        }
    
    // Boolean parsing for connection notification and debug logging
    } else if (args[0] == "notify_connection" || args[0] == "debug" || args[0] == "spam" || args[0] == "emojispam" || args[0] == "nhc_from_github" || args[0] == "shortHate") {
        let newValue = "";
        
        // Try to parse the given value
        if (args[1] == "true") {
            newValue = true;
        } else if (args[1] == "false") {
            newValue = false;
        } else {
            return `Invlaid option ${args[1]} for config item ${args[0]}`;
        }

        // Set the value
        if (args[0] == "notify_connection") {
            config.notify_connection = newValue;
        } else if (args[0] == "debug") {
            config.debug = newValue;
        } else if (args[0] == "spam") {
            config.spam = newValue;
        } else if (args[0] == "emojispam") {
            config.emojispam = newValue;
        } else if (args[0] == "nhc_from_github") {
            config.nhc_from_github = newValue;
        } else if (args[0] == "shortHate") {
            config.shortHate = newValue;
        }

        message = `Changed config item '${args[0]}' to value '${newValue}'`;

    // Print current config values
    } else if (args[0] == "read" || args[0] == undefined) {
        console.log(config);
        message = `\`\`\`Current config values\ntext_results: ${config.text_results}\nimage_results: ${config.image_results}\nnotify_connection: ${config.notify_connection}\nspam: ${config.spam}\nnhc_from_github: ${config.nhc_from_github}\nemojispam: ${config.emojispam}\nmemeSubreddit: ${config.memeSubreddit}\nshortHate: ${config.shortHate}\ndebug: ${config.debug}\`\`\``;
    } else {
        return `Config item '${args[0]}' not recognized`;
    }

    // Write the updated config file
    fs.writeFileSync('config.json', JSON.stringify(config));

    return message;
}

function rollCommand(args) {
    let message = "";

    if (args[0] == "-?") {
        //TODO: Call the helpCommand() function {message = helpCommand(args)}

    } else {
        var diceSides = 6;
        var potentialSides = parseInt(args[0]);

        if (!isNaN(potentialSides)) {
            diceSides = potentialSides;

            if (diceSides < 2) {
                diceSides = 2;
            }
        }

        message = "You rolled a " + randomNumber(1, diceSides) + " on a " + diceSides + "-sided die.";
    }

    return message;
}

function helpCommand(args) {
    
}

function randomNumber(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

// Sends questions to Wolfram|Alpha
function wolframCommand(args) {
    searchTerm = args.join(" ");
    returnData = getHtml(`http://api.wolframalpha.com/v2/query?appid=${wa_key}&input=${searchTerm}`);

    // Printing the XML to the log helps with debugging when a new pod type is found
    //console.log(returnData);

    // Find the result
    answerPodIdx = returnData.indexOf("<pod title='Result'");

    // Try to find alternate results if there's no 'Result' pod
    if (answerPodIdx == -1) {
        answerPodIdx = returnData.indexOf("<pod title='Current result'");

        if (answerPodIdx == -1) {
            answerPodIdx = returnData.indexOf("<pod title='Table'");

            if (answerPodIdx == -1) {
                answerPodIdx = returnData.indexOf("<pod title='Plot'");

                // More to come, I suppose
                if (answerPodIdx == -1) {
                    answerPodIdx = returnData.indexOf("<pod title='Plots'");

                    if (answerPodIdx == -1) {
                        return "Sorry, I don't understand your query."
                    }
                }

                // Handle plots
                resultStartIdx = returnData.indexOf("src='", answerPodIdx) + "src=".length;
                resultEndIdx = returnData.indexOf("alt=", resultStartIdx);

                link = returnData.substring(resultStartIdx, resultEndIdx);
                link = link.trim();
                link = link.replace("&amp;", "&");
                link = link.slice(1, -1);

                return link;
            }
        }
    }

    plaintextIdx = returnData.indexOf("<plaintext>", answerPodIdx);

    if (answerPodIdx == -1 || plaintextIdx == -1) {
        return "Sorry, I don't understand your query."
    }

    resultStartIdx = plaintextIdx + "<plaintext>".length;
    resultEndIdx = returnData.indexOf("</plaintext", resultStartIdx);

    result = returnData.substring(resultStartIdx, resultEndIdx);

    result = result.replace(/&amp;/g, '&').replace(/&apos;/g, "'");

    return result;
}

// Sends a message to the given Discord channel
function sendMessage(string, message) {
    message.channel.send(string);
}

// Retrieves NOAA Atlantic Ocean tropical storm map
function noaaCommand() {
    // If the option is enabled, the link is always the same
    if (config.nhc_from_github) {
        console.log("Retrieving NOAA ATL image from nhc-cones github project");
        return "https://protuhj.github.io/nhc-cones/atl_latest.png"
    }

    console.log("Retrieving NOAA ATL image");
    
    // Retrieve the HTML
    rawHtml = getHtml("https://www.nhc.noaa.gov/");

    // Write the raw HTML to file for debugging/manual inspection
    fs.writeFile("latestSearch.html", rawHtml, function (err) {
        if (err) throw err;
    });

    // Only search between the "START"/"END" comments
    startIdx = rawHtml.indexOf("<!-- START OF CONTENTS -->");
    endIdx = rawHtml.indexOf("<!-- END OF CONTENTS -->", startIdx);
    contentArea = rawHtml.substring(startIdx, endIdx);

    // Find the <img ... > tag
    tagStart = contentArea.indexOf("<img id=");
    tagEnd = contentArea.indexOf(">", tagStart);
    imgTag = contentArea.substring(tagStart, tagEnd);

    // Retrieve the link from the tag
    linkStart = imgTag.indexOf("src=") + "src=".length;
    linkEnd = imgTag.indexOf("useMap=", linkStart);
    link = imgTag.substring(linkStart, linkEnd);

    response = "https://www.nhc.noaa.gov" + link.replace(/'/g, '')

    return response;
}

function getNthIndex(string, substring, n) {
    thisIdx = string.indexOf(substring);

    if (n == 1) {
        return thisIdx;
    }

    iteration = 1
    while (thisIdx != -1) {
        iteration = iteration + 1;
        thisIdx = string.indexOf(substring, thisIdx + 1);

        if (iteration == n) {
            return thisidx
        }
    }
}

function memeCommand() {
    redditUrl = "https://www.reddit.com/r/" + config.memeSubreddit + "/top/?t=all"

    // Retrieve the HTML
    rawHtml = getHtml(redditUrl)

    // Write the raw HTML to file for debugging/manual inspection
    fs.writeFile("latestSearch.html", rawHtml, function (err) {
        if (err) throw err;
    });

    // Find the third instance of the <a> tag. This is the first post.
    thirdAIdx = getNthIndex(rawHtml, "<a href=", 3);
    return thirdAIdx
}