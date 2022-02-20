const fs = require("fs");
const Discord = require("discord.js");
const request = require("sync-request");
const encodeurl = require("encodeurl");

// Initialize configuration data
let config = {
    "text_results": null,
    "image_results": null,
    "notify_connection": null,
    "metered_wolfram": null,
    "nhc_from_github": null,
    "reactions": null,
    "sarcasmText": null,
    "debug": null
};

let messageCount = {
    "henry": null,
    "eliot": null,
    "duncan": null,
    "logan": null
};

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
    console.log('=== UNHANDLED REJECTION ===');
    console.dir(error.stack);
});

// Fires when bot connects
bot.on("ready", () => {
    // Record time and log connection in console
    const reconnectTime = new Date(Date.now());
    console.log(`Connected as ${bot.user.username} (id ${bot.user}) on ${reconnectTime.toUTCString()}`);

    // Load config
    let rawConfig = fs.readFileSync("./config/config.json");
    config = JSON.parse(rawConfig.toString());

    // Load message count file
    let rawMessageCount = fs.readFileSync("./config/messageCount.json");
    messageCount = JSON.parse(rawMessageCount.toString());

    // Load reaction config file
    let rawReaction = fs.readFileSync("./config/reactions.json");
    reactionConfig = JSON.parse(rawReaction.toString());

    // Optionally notify server of connection
    if (config.notify_connection) {
        bot.channels.cache.get('525521991424278529').send('Connected')
    }
});

// Fires when a message is received
bot.on("messageCreate", message => {
    let mention = message.mentions.users.first();

    // Ignore grave symbols ( ` ) since it messes with discord formatting so much
    let content = message.content.replace("’", "");

    // Early return if the message was sent by GoogleBot itself
    if (message.author === bot.user) {
        return
    }

    let writeFile = false;

    // Count messages sent by human users
    //TODO: Don't hardcode the names here; loop through the count config properly
    if (message.author.id === "136882320799039488" ) { // Henry
        messageCount.henry = parseInt(messageCount.henry) + 1;
        writeFile = true;

    } else if (message.author.id === "523387286126067723") { // Eliot
        messageCount.eliot = parseInt(messageCount.eliot) + 1;
        writeFile = true;

    } else if (message.author.id === "181967094185852929") { // Duncan
        messageCount.duncan = parseInt(messageCount.duncan) + 1;
        writeFile = true;

    } else if (message.author.id === "523520159671910410") { // Logan
        messageCount.logan = parseInt(messageCount.logan) + 1;
        writeFile = true;
    }

    if (writeFile === true) {
        try {
            fs.writeFileSync('./config/messageCount.json', JSON.stringify(messageCount, null, 4));
        } catch (e) {
            console.log(`Writing message count file failed with error:\n${e}`);
        }
    }

    // If the message starts with either the real bot mention string or the nickname bot mention string
    if (mention === bot.user) {
        // Parse out the mentionString
        let commandString = content.substring(content.search(" ") + 1);
        console.log(`Received command: ${commandString}`);

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

//TODO: Make a log() function that does console.log() and also saves to the log file

// Parse commands, call appropriate command-specific functions, and send the response
function commandParser(content, message) {
    // Parse command
    let words = content.split(" ");
    let command = words[1].substring(1);
    let args = words.slice(2);
    let response;

    console.log("Found command '" + command + "' with args '" + args + "'");

    // Call command-specific functions
    switch(command) {
        case "config":
            response = configCommand(args);
            break;

        case "reaction":
            response = reactionCommand(args);
            break;

        case "roll":
            response = rollCommand(args);
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

        case "count":
            response = countCommand();
            break;

        default:
            response = "Command \"" + command + "\" not recognized";
    }

    // Send response
    if (message !== "") {
        sendMessage(response, message);
        console.log("Sent message: " + response);
    }
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
    let parsedTerm = encodeurl(searchTerm);
    let rawHtml = getHtml(`http://www.google.com/search?q=${parsedTerm}&tbm=isch`);

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
    console.log("Sent message: " + response);
}

// Sends result of Google search for given query
function linkSearch (content, message) {
    console.log("Performing link search for message: " + content);

    let searchTerm = content.substring(content.search(" ") + 1);
    console.log("Searching for links of: " + searchTerm);

    // Retrieve the HTML
    let parsedTerm = encodeurl(searchTerm);
    let rawHtml = getHtml(`http://www.google.com/search?q=${parsedTerm}`);

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
    console.log("Sent message: " + response);
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
        if (config.debug) {
            let quoteText;

            if (linkString.length > 1000) {
                quoteText = `linkString is too long to display. startString: ${startString}    endString: ${endString}`;
            } else {
                quoteText = linkString
            }
            return [`Cannot parse URI. LinkString: \`\`\`${quoteText}\`\`\``, 0];
        } else {
            return ["Cannot parse URI. Don't search for such silly nonsense.", 0];
        }
    }
}

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

function rollCommand(args) {
    let message;

    let diceSides = 6;
    let potentialSides = parseInt(args[0]);

    if (!isNaN(potentialSides)) {
        diceSides = potentialSides;

        if (diceSides < 2) {
            diceSides = 2;
        }
    }

    message = "You rolled a " + randomNumber(1, diceSides) + " on a " + diceSides + "-sided die.";

    return message;
}

function randomNumber(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

// Sends question to Wolfram|Alpha using their Simple API (which creates images for answers)
function wolframCommand(args) {
    // Use the Simple API if requested
    if (args[0] === "image") {
        console.log(`Searching Wolfram Simple API for ${args.slice(1).join(" ")}`);
        let searchTerm = encodeurl(args.slice(1).join(" "))
        return `http://api.wolframalpha.com/v1/simple?appid=${wa_key}&i=${searchTerm}`
    }

    // Default to the Short Answers API
    console.log(`Searching Wolfram Short Answers API for ${args.join(" ")}`);
    let searchTerm = encodeurl(args.join(" "))

    try {
        let response = getHtml(`http://api.wolframalpha.com/v1/result?appid=${wa_key}&i=${searchTerm}`);
        console.log(`Received response: ${response}`);
        return "`" + response + "`";

    // Wolfram returns errors as HTML codes which crashes getHtml(), so we do this
    } catch {
        return "`Wolfram|Alpha did not understand your input`";
    }
}

// Sends a message to the Discord channel the given message was from
function sendMessage(string, message) {
    message.channel.send(string);
}

// Displays how many messages each user has sent
function countCommand() {
    let henry = messageCount.henry;
    let eliot = messageCount.eliot;
    let duncan = messageCount.duncan;
    let logan = messageCount.logan;
    let totalMessages = henry + eliot + duncan + logan;

    let serverOrigin = new Date('December 15, 2018 15:57:00');
    let currentDate = Date.now();
    let elapsedMilliseconds = currentDate - serverOrigin;
    let elapsedDays = Math.floor(elapsedMilliseconds / (1000 * 60 * 60 * 24));
    let messagesPerDay = (totalMessages / elapsedDays).toFixed(2);

    henry = henry.toLocaleString("en-us");
    eliot = eliot.toLocaleString("en-us");
    duncan = duncan.toLocaleString("en-us");
    logan = logan.toLocaleString("en-us");
    totalMessages = totalMessages.toLocaleString("en-us");
    messagesPerDay = messagesPerDay.toLocaleString("en-us");

    return `\`\`\`Current message counts\n\nHenry: ${henry}\nEliot: ${eliot}\nDuncan: ${duncan}\nLogan: ${logan}\n\nTotal: ${totalMessages}\nPer day: ${messagesPerDay}\`\`\``;
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

function hasSarcasm(text) {
    let trimmed = text.toLowerCase().trim();

    if (trimmed.endsWith("/s") || trimmed.endsWith("\\s")) {
        return [true, trimmed.substring(0, trimmed.length-2)]
    }

    return [false, text]
}

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