// NPM imports
const fs = require("fs");
const Discord = require("discord.js");
const request = require("sync-request");
const encodeurl = require("encodeurl");

// Initialize configuration data
let config = {
    "text_results": 1,
    "image_results": 1,
    "notify_connection": false,
    "nhc_from_github": false,
    "reactions": false,
    "sarcasmText": false
};
let messageCount = {};
let reactionConfig = {};
let wa_key = "";

// Initialize bot
let bot = new Discord.Client({intents: ["GUILDS", "GUILD_MESSAGES"]});

// Ingest secrets
try {
    const auth = require("./config/auth.json");
    bot.login(auth.token);
    wa_key = auth.wa;
} catch {
    authtoken = process.env.AUTH_TOKEN;
    wa_key = process.env.WA_API
    bot.login(authtoken);
}

// Fires when unhandled promise rejections occur
process.on('unhandledRejection', (error) => {
    log('=== UNHANDLED REJECTION ===');
    console.dir(error.stack);
});

// Fires when bot connects
bot.on("ready", () => {
    // Record time and log connection in console
    const reconnectTime = new Date(Date.now());
    log(`Connected as ${bot.user.username} (id ${bot.user}) on ${reconnectTime.toUTCString()}`);

    // Load configuration and data files
    config = JSON.parse(fs.readFileSync("./config/config.json").toString());
    messageCount = JSON.parse(fs.readFileSync("./config/messageCount.json").toString());
    reactionConfig = JSON.parse(fs.readFileSync("./config/reactions.json").toString());

    // Optionally notify server of connection
    if (config.notify_connection) {
        bot.channels.cache.get('525521991424278529').send('Connected')
    }

    // Back up log file and make a new blank one
    fs.renameSync("./logs/log.txt", "./logs/log_old.txt");
    fs.closeSync(fs.openSync("./logs/log.txt", "w"));
});

// Fires when a message is created
bot.on("messageCreate", message => {
    let mention = message.mentions.users.first();

    // Ignore grave symbols ( ` ) since it messes with discord formatting so much
    let content = message.content.replace("’", "");

    // Early return if the message was sent by GoogleBot itself
    if (message.author === bot.user) {
        return
    }

    // Count messages sent by users tracked in 'messageCount.json', as long as it's not a !count command
    try {
        if (content.split(" ")[1].substring(1) !== "count") {
            for (let userId in messageCount["counts"]) {
                if (message.author.id === userId) {
                    updateMessageCount(userId);
                    break;
                }
            }
        }
    } catch { }

    // If the message starts with either the real bot mention string or the nickname bot mention string
    if (mention === bot.user) {
        // Parse out the mentionString
        let commandString = content.substring(content.search(" ") + 1);
        log(`Received command: ${commandString}`);

        // Handle commands
        if (commandString.startsWith("!")) {
            log("Handling command: " + content);
            commandParser(content, message);

        // Handle image searching
        } else if (commandString.startsWith("image ") || commandString.startsWith("images ") || commandString.startsWith("picture ") || commandString.startsWith("pictures ")) {
            log("Image searching: " + content);
            imageSearch(content, message);

        // Handle link searching
        } else {
            log("Link searching: " + content);
            linkSearch(content, message);
        }
    }

    // React to the message, per 'reactions.json'
    if (config.reactions) {
        for (let reactionId in reactionConfig) {
            let searchTerm = reactionConfig[reactionId]["term"];

            // Check user whitelist, if applicable
            if (reactionConfig[reactionId]["whitelist"] == null || reactionConfig[reactionId]["whitelist"] === message.author.id) {
                if (content.toLowerCase().search(searchTerm.toLowerCase()) !== -1) {
                    let reactionType = reactionConfig[reactionId]["type"];

                    if (reactionType === "emoji") {
                        let listOfReactions = reactionConfig[reactionId]["reaction"].split(" ");

                        if (listOfReactions.length === 1) {
                            message.react(reactionConfig[reactionId]["reaction"]);

                        // If there are multiple emoji to send, loop through them
                        } else {
                            for (let reaction in listOfReactions) {
                                message.react(listOfReactions[reaction]);

                                // Add a slight delay to ensure proper order and (hopefully) avoid being rate-limited
                                new Promise(r => setTimeout(r, 500));
                            }
                        }

                    } else if (reactionType === "text") {
                        sendMessage(reactionConfig[reactionId]["reaction"], message);
                    }
                }
            }
        }
    }

    if (config.sarcasmText) {
        [sarcastic, text] = hasSarcasm(content)

        if (sarcastic) {
            sendMessage(sarcasmText(text), message);
        }
    }
});

// Increment messageCount object and JSON file for given UserID
function updateMessageCount(userId) {
    messageCount["counts"][userId] = parseInt(messageCount["counts"][userId]) + 1;

    try {
        fs.writeFileSync('./config/messageCount.json', JSON.stringify(messageCount, null, 4));
    } catch (e) {
        log(`Writing message count file failed with error:\n${e}`);
    }
}

// Save log entries to both the log and the console
function log(messageToLog) {
    console.log(messageToLog);

    let logFile = fs.readFileSync("./logs/log.txt").toString();

    logFile += `\n${messageToLog}`

    fs.writeFileSync("./logs/log.txt", logFile);
}

// Parse commands, call appropriate command-specific functions, and send the response
function commandParser(content, message) {
    // Parse command
    let words = content.split(" ");
    let command = words[1].substring(1);
    let args = words.slice(2);
    let response;

    log("Found command '" + command + "' with args '" + args + "'");

    // Call command-specific functions
    if (command === "config") {
        response = configCommand(args);

    } else if (command === "reaction") {
        response = reactionCommand(args);

    } else if (command === "roll") {
        response = rollCommand(args);

    } else if (command === "w" || command === "wa") {
        response = wolframCommand(args);

    } else if (command === "latex") {
        response = "<@!646523630309605396> !" + command + " " + args.join(" ");

    } else if (command === "nhc" || command === "noaa") {
        response = noaaCommand();

    } else if (command === "count") {
        response = countCommand(args, message);

    } else {
        response = "Command \"" + command + "\" not recognized";
    }

    // Send response
    if (message !== "") {
        sendMessage(response, message);
        log("Sent message: " + response);
    }
}

// Finds result of Google Image search for given query
function imageSearch(content, message) {
    log("Performing image search for message: " + content);

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

    log("Searching for images of: " + searchTerm);

    // Retrieve the HTML
    let parsedTerm = encodeurl(searchTerm);
    let rawHtml = getHtml(`https://www.google.com/search?q=${parsedTerm}&tbm=isch`);

    // Write the raw HTML to file for debugging/manual inspection
    fs.writeFile("./logs/latest_image_search.html", rawHtml, function (err) {
        if (err) throw err;
    });

    let response = "";
    for (let i = 0; i < imagesToSend; i++) {
        let [thisResponse, responseIdx] = findLinkInHtml(rawHtml, "<img class=\"yWs4tf\"", "&amp;s"); //NOTE: Google likes to change the img class to mess with us
        rawHtml = rawHtml.substring(responseIdx);
        response += thisResponse + "\n";
    }

    // Send response
    sendMessage(response, message);
    log("Sent message: " + response);
}

// Finds result of Google search for given query
function linkSearch (content, message) {
    log("Performing link search for message: " + content);

    let searchTerm = content.substring(content.search(" ") + 1);
    log("Searching for links of: " + searchTerm);

    // Retrieve the HTML
    let parsedTerm = encodeurl(searchTerm);
    let rawHtml = getHtml(`https://www.google.com/search?q=${parsedTerm}`);

    // Write the raw HTML to file for debugging/manual inspection
    fs.writeFile("./logs/latest_link_search.html", rawHtml, function (err) {
        if (err) throw err;
    });

    let response = "";
    for (let i = 0; i < config.text_results; i++) {
        let [thisResponse, responseIdx] = findLinkInHtml(rawHtml, "<div class=\"egMi0 kCrYT\"><a href=", "&amp;sa=U&amp;");
        rawHtml = rawHtml.substring(responseIdx);
        response += thisResponse + "\n";
    }

    // Send response
    sendMessage(response, message);
    log("Sent message: " + response);
}

// Retrieves raw HTML from given URL
function getHtml(url) {
    let rawHtml = request("GET", url);

    return rawHtml.getBody("utf8");
}

// Returns content found between given start and end strings inside the source string
function findInHtml(source, startString, endString) {
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
    let [linkString, nextSearchIdx] = findInHtml(source, startString, endString);

    linkString = linkString.substring(linkString.search("http"));

    try {
        return [decodeURIComponent(linkString), nextSearchIdx];
    } catch(error) {
        let quoteText;

        if (linkString.length > 1000) {
            quoteText = `linkString is too long to display. startString: ${startString}    endString: ${endString}`;
        } else {
            quoteText = linkString
        }
        return [`Cannot parse URI. LinkString: \`\`\`${quoteText}\`\`\``, 0];
    }
}

// Handles the config command
function configCommand(args) {
    let message;

    // Print current config if no arguments
    if (args.length === 0) {
        return `\`\`\`${JSON.stringify(config, null, 4)}\`\`\``
    }

    // Parse values from args
    let fieldToChange = args[0];
    let newValue = args[1];

    // Check validity of config change for search results
    let parsedNewValue;

    if (fieldToChange === "text_results" || fieldToChange === "image_results") {
        parsedNewValue = parseInt(newValue);

        if (isNaN(parsedNewValue) || parsedNewValue < 1 || parsedNewValue > 10) {
            return `Cannot parse ${parsedNewValue} as a number of search return results.`
        }

    // Other than those two, all other config values are boolean
    } else {
        if (newValue.toLowerCase() === "true") {
            parsedNewValue = true;
        } else if (newValue.toLowerCase() === "false") {
            parsedNewValue = false;
        } else {
            return `Cannot parse ${newValue} as a boolean.`
        }
    }

    // Update config object
    try {
        config[fieldToChange] = parsedNewValue;
        message = `Changed config item '${fieldToChange}' to value '${parsedNewValue}'`;
    } catch {
        return `Error: Could not change config item '${fieldToChange}' to value '${parsedNewValue}'`
    }

    // Save new config to file
    fs.writeFileSync('./config/config.json', JSON.stringify(config, null, 4));

    return message;
}

// Handles the reaction command
function reactionCommand(args) {
    let returnMessage = "";

    if (args[0] === "-h" || args[0] === "help" || args[0] === "--help") {
        //TODO: Re-implement old old method of handling help files
        let helpText =  "```Manages GoogleBot reactions."
        helpText += "\n\nBasic usage:"
        helpText += "\nView existing reactions: @Google !reaction"
        helpText += "\nAdd new reaction: @Google !reaction set new <term to react to>"
        helpText += "\nEdit existing reaction: @Google !reaction set <reaction ID> <property to change> <new value>"
        helpText += "\nRemove existing reaction: @Google !reaction remove <reaction ID>"
        helpText += "\n\nProperties:"
        helpText += "\nid: The ID of the reaction."
        helpText += "\nterm: The search term to react to."
        helpText += "\ntype: Either 'emoji' or 'text' - controls whether GoogleBot reacts via a Discord Reaction (emoji) or with a new message (text)"
        helpText += "\nreaction: The emoji to react with or the text to send, depending on 'type'. Can include links, and many links will automatically preview."
        helpText += "\nwhitelist: Whitelist of users to react to for this reaction. If 'null' then all users are reacted to."
        helpText += "```"
        return helpText

    // Create or updates reaction to a given term
    } else if (args[0] === "set") {
        // Make a new entry
        if (args[1] === "new") {
            let term = args.slice(2).join(" ");

            // Check if the term is already used by an existing reaction
            for (let id in reactionConfig) {
                if (term === reactionConfig[id]["term"]) {
                    return `The term \`${term}\` is already in use by reaction ID \`${reactionConfig[id]["id"]}\``
                }
            }

            let newName = Date.now();

            let newReactionObj = {
                id: null, // tracker ID, and the name of the object
                term: null, // search term to react to
                type: null, // "emoji" or "link"
                reaction: null, // the emoji(s) or link to send
                whitelist: null // user ID whitelist to activate this reaction on; if null then reaction is always active
            };

            newReactionObj["id"] = newName;
            newReactionObj["term"] = term;

            // Create a new JSON object using current ECMAScript timestamp
            reactionConfig[newName] = newReactionObj;

            returnMessage = `Created new reaction for term \`${term}\` with ID \`${newName}\``;

        // Update existing entry
        } else {
            // Retrieve update information from args
            let entryToUpdate = args[1];
            let valueToUpdate = args[2];
            let newValue = args.slice(3).join(" ");

            // Quick sanity check for the type
            if (valueToUpdate === "type" && newValue !== "emoji" && newValue !== "text") {
                return `Error: \`type\` only accepts the following values: \`emoji\`, \`text\``
            }

            // Update object values
            try {
                reactionConfig[entryToUpdate][valueToUpdate] = newValue;
            } catch {
                return `Error: Could not update \`${entryToUpdate}.${valueToUpdate}\` to value \`${newValue}\``
            }

            returnMessage = `Updated id \`${entryToUpdate}.${valueToUpdate}\` to value \`${newValue}\``;
        }

    // Remove an existing reaction
    } else if (args[0] === "remove") {
        let id = args[1];

        // Loop through existing reactions, looking for one with matching ID
        let foundMatch = false;
        for (let reaction in reactionConfig) {
            if (String(reaction) === String(id)) {
                // Remove such an entry if one exists
                foundMatch = true;
                delete reactionConfig[reaction];
                returnMessage = `Removed entry with ID \`${id}\`.`
            }
        }

        if (foundMatch === false) {
            return `Error: Could not find matching entry for ID \`${id}\`. Nothing was removed.`
        }

    // Display the entirety of the config
    } else {
        return "```" + JSON.stringify(reactionConfig, null, 4) + "```"
    }

    // Save the updated reaction config to file
    fs.writeFileSync('./config/reactions.json', JSON.stringify(reactionConfig, null, 4));

    return returnMessage;
}

// Handles the roll command
function rollCommand(args) {
    let diceSides = 6;
    let potentialSides = parseInt(args[0]);

    if (!isNaN(potentialSides)) {
        diceSides = potentialSides;

        if (diceSides < 2) {
            diceSides = 2;
        }
    }

    return "You rolled a `" + randomNumber(1, diceSides) + "` on a `" + diceSides + "`-sided die.";
}

// Returns a scaled random number based on given min and max values
function randomNumber(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

// Sends query to Wolfram|Alpha using either the Short Answers or Simple API
function wolframCommand(args) {
    // Use the Simple API if requested
    if (args[0] === "image") {
        log(`Searching Wolfram Simple API for ${args.slice(1).join(" ")}`);
        let searchTerm = encodeurl(args.slice(1).join(" ")).replace("+", "%2B");
        return `https://api.wolframalpha.com/v1/simple?appid=${wa_key}&i=${searchTerm}`
    }

    // Default to the Short Answers API
    log(`Searching Wolfram Short Answers API for ${args.join(" ")}`);
    let searchTerm = encodeurl(args.join(" ")).replace("+", "%2B");

    try {
        let response = getHtml(`https://api.wolframalpha.com/v1/result?appid=${wa_key}&i=${searchTerm}`);
        log(`Received response: ${response}`);
        return "`" + response + "`";

    // Wolfram returns errors as HTML codes which crashes getHtml(), so we do this
    } catch {
        return "`Wolfram|Alpha did not understand your input`";
    }
}

// Sends a new message to the Discord channel the given message was from
function sendMessage(string, message) {
    message.channel.send(string);
}

// Displays how many messages each user has sent
function countCommand(args, message) {
    // Reload data from file if requested
    if (args[0] === "reload") {
        // Scan the counts from file and build the printout
        messageCount = JSON.parse(fs.readFileSync("./config/messageCount.json").toString());
        let newCounts = countCommand(" ", message);

        return `Message counts reloaded from file. New message counts:\n${newCounts}`;
    }

    // Add the message requesting a count
    updateMessageCount(message.author.id)

    let counts = messageCount["counts"];

    // Count total messages sent
    let totalMessages = 0;
    for (let count in counts) {
        totalMessages += parseInt(counts[count]);
    }

    let serverOrigin = new Date('December 15, 2018 15:57:00');
    let currentDate = Date.now();
    let elapsedMilliseconds = currentDate - serverOrigin;
    let elapsedDays = Math.floor(elapsedMilliseconds / (1000 * 60 * 60 * 24));
    let messagesPerDay = (totalMessages / elapsedDays).toFixed(2);

    let readout = "Current message counts\n";
    for (let count in counts) {
        readout += `\n${messageCount["aliases"][count]}: ${parseInt(counts[count]).toLocaleString("en-us")}`
    }

    readout += `\n\nTotal: ${totalMessages.toLocaleString("en-us")}`
    readout += `\nPer day: ${messagesPerDay}`

    return "```" + readout + "```";
}

// Retrieves NOAA Atlantic Ocean tropical storm map
function noaaCommand() {
    // If the option is enabled, the link is always the same
    if (config.nhc_from_github) {
        log("Retrieving NOAA ATL image from nhc-cones github project");
        return "https://protuhj.github.io/nhc-cones/atl_latest.png"
    }

    log("Retrieving NOAA ATL image");

    // Retrieve the HTML
    let rawHtml = getHtml("https://www.nhc.noaa.gov/");

    // Write the raw HTML to file for debugging/manual inspection
    fs.writeFile("./logs/latest_noaa_image.html", rawHtml, function (err) {
        if (err) throw err;
    });

    // Only search between the "START"/"END" comments
    let startIdx = rawHtml.indexOf("<!-- START OF CONTENTS -->");
    let endIdx = rawHtml.indexOf("<!-- END OF CONTENTS -->", startIdx);
    let contentArea = rawHtml.substring(startIdx, endIdx);

    // Find the <img ... > tag
    let tagStart = contentArea.indexOf("<img id=");
    let tagEnd = contentArea.indexOf(">", tagStart);
    let imgTag = contentArea.substring(tagStart, tagEnd);

    // Retrieve the link from the tag
    let linkStart = imgTag.indexOf("src=") + "src=".length;
    let linkEnd = imgTag.indexOf("useMap=", linkStart);
    let link = imgTag.substring(linkStart, linkEnd);

    return "https://www.nhc.noaa.gov" + link.replace(/'/g, '')
}

// Detects if the given text has "\s" or "/s" at the end
function hasSarcasm(text) {
    let trimmed = text.toLowerCase().trim();

    if (trimmed.endsWith("/s") || trimmed.endsWith("\\s")) {
        return [true, trimmed.substring(0, trimmed.length-2)]
    }

    return [false, text]
}

// Alternates capitalization for the given text
function sarcasmText(text) {
    let returnString = "";

    for (let i = 0; i < text.length; i++) {
        if (i % 2 === 0) {
            returnString = returnString.concat(text.charAt(i).toUpperCase());
        } else {
            returnString = returnString.concat(text.charAt(i).toLowerCase());
        }
    }

    return returnString
}