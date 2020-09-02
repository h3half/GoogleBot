import discord
import random
import sys
from urllib.request import urlopen, Request
from urllib.parse import quote, unquote
from pathlib import Path

DEBUG = True

# Handles all incoming messages
async def handleMessage(message, client):
    # Prevents the bot from answering its own messages
    if (message.author == client.user):
        return
    
    # Only care about the message if it starts with '@Google'
    mentionString = client.user.mention
    if (message.content.startswith(mentionString + ' ')):        
        # Handle commands
        if (message.content.startswith(mentionString + ' !')):
            await commandParser(message)
        # Handle images
        elif (message.content.startswith(mentionString + ' image ') or message.content.startswith(mentionString + ' picture ') or message.content.startswith(mentionString + ' images ') or message.content.startswith(mentionString + ' pictures ')):
            await imageSearch(message)
        # Do a link search if there's nothing else to do
        else:
            await linkSearch(message)

def readConfig(parameter):
    paramValue = -1
    
    with open('GoogleBot.config') as configFile:
        configLines = configFile.readlines()

        for line in configLines:
            if parameter.lower() in line:
                paramValue = int(line[len(parameter) + 2:])
                break
        
        if DEBUG:
            print("Config:: Found config value of \"" + str(paramValue) + "\" for parameter \"" + str(parameter) + "\"")
            
        return paramValue

# Handles commands to the bot (prefaced by "!")
async def commandParser(message):
    command = message.content[message.content.find('!') + 1:]
    
    # !version
    if (command.startswith('version')):
        msgResponse = versionCommand(command)
    
    # !changelog
    elif (command.startswith('changelog')):
        msgResponse = changelogCommand(command)
    
    # !config
    elif (command.startswith('config')):
        msgResponse = configCommand(command)
    
    # !roll
    elif (command.startswith('roll')):
        msgResponse = rollCommand(command)

    # !help
    elif (command.startswith('help')):
        msgResponse = helpCommand(command)
    

    # Undefined command
    else:
        msgResponse = "Command \"" + command + "\" not recognized"
    
    if DEBUG:
        print("Recieved command: " + command)
        print("Sending response:\n" + msgResponse)
    
    await message.channel.send(msgResponse)

# Handles the version command
def versionCommand(command):
    if ('-?' in command):
        helpTopic = "version"
        helpPath = Path("help/" + helpTopic + ".help")
        
        with helpPath.open("r") as helpFile:
            msgResponse = "```\n" + helpFile.read() + "\n```"
    else:
        with open('changelog.txt', "r") as myFile:
            msgResponse = "```" + myFile.readline().strip() + "```"
    
    return msgResponse
            
# Handles the changelog command
def changelogCommand(command):
    if ('-?' in command):
        helpTopic = "changelog"
        helpPath = Path("help/" + helpTopic + ".help")
        
        with helpPath.open("r") as helpFile:
            msgResponse = "```\n" + helpFile.read() + "\n```"
    else:
        with open('changelog.txt', "r") as myFile:
            if ('-f' in command or '-full' in command):
                msgResponse = "```" + myFile.read() + "```"
            else:
                msgResponse = "```"
                tempResponse = myFile.readlines()
                for line in tempResponse:
                    if (not tempResponse[0].strip() in line and line.startswith('v')):
                        msgResponse += "```"
                        break
                    else:
                        msgResponse += line
    
    return msgResponse

# Handles the config command
def configCommand(command):
    if ('-?' in command):
        helpTopic = "config"
        helpPath = Path("help/" + helpTopic + ".help")
        
        with helpPath.open("r") as helpFile:
            msgResponse = "```\n" + helpFile.read() + "\n```"
    else:
        if ('-s' in command or '-set' in command):
            setSection = command[command.find("-s"):]
            paramSection = setSection[setSection.find(" ") + 1:]
            parameter = paramSection[:paramSection.find(" ")]
            value = paramSection[paramSection.find(" ") + 1:]
            value = safeCast(value, int, 1)
            
            result = writeConfig(parameter, value)
            
            if result:
                msgResponse = "```Set \"" + parameter + "\" to value \"" + str(value) + "\"```"
            else:
                msgResponse = "```Failed to set \"" + parameter + "\" to value \"" + str(value) + "\"```"
        else:
            with open("GoogleBot.config", "r") as configFile:
                msgResponse = "Contents of config file:\n```" + configFile.read() + "```"
    
    return msgResponse

# Handles the roll command
def rollCommand(command):
    if ('-?' in command):
        helpTopic = "roll"
        helpPath = Path("help/" + helpTopic + ".help")

        with helpPath.open("r") as helpFile:
            msgResponse = "```\n" + helpFile.read() + "\n```"
    else:
        msgResponse = ''
        for character in command.split():
            if character.isdigit():
                if int(character) < 1:
                    character = '2'
                elif int(character) > sys.maxsize:
                    character = str(sys.maxsize)

                msgResponse = "You rolled a " + str(random.randrange(1, int(character))) + " on a " + character + "-sided die."

    if len(msgResponse) == 0:
        msgResponse = "You rolled a " + str(random.randrange(1, 6)) + " on a 6-sided die."

    return msgResponse

# Handles the help command
def helpCommand(command):
    if ('-?' in command):
        helpTopic = "help"
        helpPath = Path("help/" + helpTopic + ".help")
        
        with helpPath.open("r") as helpFile:
            msgResponse = "```\n" + helpFile.read() + "\n```"
    else:
        basicHelp = False
        
        # Checks if there's another word after "!help"
        if (command.find(" ") != -1):
            helpTopic = command[command.find(" ") + 1:]
            helpPath = Path("help/" + helpTopic + ".help")
            
            # If there isn't a specific help file for the second word, just display the basic help
            if (not helpPath.is_file()):
                basicHelp = True
            else:
                if DEBUG:
                    print("Found topic-specific help file for topic: " + helpTopic)
        
        if (command.find(" ") == -1 or basicHelp):
            helpPath = Path("overview.help")
        
        with helpPath.open("r") as helpFile:
            msgResponse = "```\n" + helpFile.read() + "\n```"
        
        if DEBUG:
            print("Displaying help file at: " + str(helpPath))
    
    return msgResponse

# Finds the top google link results
async def linkSearch(message):
    TEXT_RESULTS = readConfig("TEXT_RESULTS")
    if (TEXT_RESULTS < 1):
        TEXT_RESULTS = 3
    elif (TEXT_RESULTS > 10):
        TEXT_RESULTS = 10

    # Initialize arrays
    resultLocation = [0 for i in range(TEXT_RESULTS)]
    containingString = [0 for i in range(TEXT_RESULTS)]
    resultStartLocation = [0 for i in range(TEXT_RESULTS)]
    resultEndLocation = [0 for i in range(TEXT_RESULTS)]
    rawLink = [0 for i in range(TEXT_RESULTS)]
    parsedLink = [0 for i in range(TEXT_RESULTS)]
    responseLink = [0 for i in range(TEXT_RESULTS)]
                  
    rawInput = message.content[message.content.find(' ') + 1:]
    inputText = quote(rawInput)
    
    requestString = 'https://www.google.com/search?q=' + inputText
    searchRequest = Request(requestString, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Hecko) Chrome/75.0.3770.100 Safari/537.36'})
    
    rawHTML = urlopen(searchRequest).read()
    decodedHTML = rawHTML.decode('utf-8')
   
    resultLocation[0] = decodedHTML.find('<div class="g"><div data-hveid="')
    containingString[0] = decodedHTML[resultLocation[0]:]
    resultStartLocation[0] = containingString[0].find('<a href="') + 9
    resultEndLocation[0] = containingString[0].find('"', resultStartLocation[0])
    rawLink[0] = containingString[0][resultStartLocation[0]:resultEndLocation[0]]
    
    for i in range(1, TEXT_RESULTS):
        resultLocation[i] = containingString[i-1].find('<div class="g">', resultEndLocation[i-1])
        containingString[i] = containingString[i-1][resultLocation[i]:]
        resultStartLocation[i] = containingString[i].find('<a href="') + 9
        resultEndLocation[i] = containingString[i].find('"', resultStartLocation[i])
        rawLink[i] = containingString[i][resultStartLocation[i]:resultEndLocation[i]]
    
    if (TEXT_RESULTS > 1):
        msgResponse = "Top " + str(TEXT_RESULTS) + " results:"
    else:
        msgResponse = "Top result:"
    
    for i in range(0, TEXT_RESULTS):
        if (rawLink[i].find('https://') == -1):
            parsedLink[i] = rawLink[i][rawLink[i].find('http://'):rawLink[i].find('&amp;sa')]
        else:
            parsedLink[i] = rawLink[i][rawLink[i].find('https://'):rawLink[i].find('&amp;sa')]
        
        responseLink[i] = unquote(parsedLink[i])
        
        msgResponse = msgResponse + "\n" + responseLink[i]
    
    if DEBUG:
        with open('lastResult.html', 'w') as file:
            file.write(decodedHTML)

        print("Link search input: " + rawInput)
        print("Returning " + str(TEXT_RESULTS) + " results from page " + requestString)
        print("Saved latest .html page to file lastResult.html")

        for i in range(0, TEXT_RESULTS):
            print("Found result (" + str(i) + "): " + responseLink[i])


        for i in range(0, TEXT_RESULTS):
            print("resultLocation[" + str(i) + "] = " + str(resultLocation[i]))
            print("resultStartLocation[" + str(i) + "] = " + str(resultStartLocation[i]))
            print("resultEndLocation[" + str(i) + "] = " + str(resultEndLocation[i]))
            print("rawLink[" + str(i) + "] = " + rawLink[i])

        print("\n")
    
    await message.channel.send(msgResponse)

async def imageSearch(message):
    IMAGE_RESULTS = readConfig("IMAGE_RESULTS")
    if (IMAGE_RESULTS < 1):
        IMAGE_RESULTS = 3
    elif (IMAGE_RESULTS > 10):
        IMAGE_RESULTS = 10
    
    # Initialize arrays
    resultLocation = [0 for i in range(IMAGE_RESULTS)]
    containingString = [0 for i in range(IMAGE_RESULTS)]
    resultStartLocation = [0 for i in range(IMAGE_RESULTS)]
    resultEndLocation = [0 for i in range(IMAGE_RESULTS)]
    rawLink = [0 for i in range(IMAGE_RESULTS)]
    parsedLink = [0 for i in range(IMAGE_RESULTS)]
    responseLink = [0 for i in range(IMAGE_RESULTS)]
    rawInput = message.content[message.content.find(' ') + 1:]
    numResponses = 1

    if (rawInput.startswith('image of ')):
        realInput = rawInput[9:]
    elif (rawInput.startswith('image ')):
        realInput = rawInput[6:]
    elif (rawInput.startswith('picture of ')):
        realInput = rawInput[11:]
    elif (rawInput.startswith('picture ')):
        realInput = rawInput[8:]
    elif (rawInput.startswith('images of ')):
        realInput = rawInput[10:]
        numResponses = IMAGE_RESULTS
    elif (rawInput.startswith('images ')):
        realInput = rawInput[7:]
        numResponses = IMAGE_RESULTS
    elif (rawInput.startswith('pictures of ')):
        realInput = rawInput[12:]
        numResponses = IMAGE_RESULTS
    elif (rawInput.startswith('pictures ')):
        realInput = rawInput[9:]
        numResponses = IMAGE_RESULTS
    
    inputText = quote(rawInput)
    
    requestString = 'https://www.google.com/search?&tbm=isch&q=' + quote(realInput)
    searchRequest = Request(requestString, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Hecko) Chrome/71.0.3578.98 Safari/537.36 Viv/2.2.1388.37'})
    
    rawHTML = urlopen(searchRequest).read()
    decodedHTML = rawHTML.decode('utf-8')
    
    resultLocation[0] = decodedHTML.find('<div class="rg_meta notranslate">')
    containingString[0] = decodedHTML[resultLocation[0]:]
    resultStartLocation[0] = containingString[0].find('"ou":"') + 6
    resultEndLocation[0] = containingString[0].find('","ow":', resultStartLocation[0])
    rawLink[0] = containingString[0][resultStartLocation[0]:resultEndLocation[0]]
    
    for i in range(1, numResponses):
        resultLocation[i] = containingString[i-1].find('<div class="rg_meta notranslate">', resultEndLocation[i-1])
        containingString[i] = containingString[i-1][resultLocation[i]:]
        resultStartLocation[i] = containingString[i].find('"ou":"') + 6
        resultEndLocation[i] = containingString[i].find('","ow":', resultStartLocation[i])
        rawLink[i] = containingString[i][resultStartLocation[i]:resultEndLocation[i]]

    if DEBUG:
        print("Image search input: " + rawInput)
        print("Searching for image of " + realInput)

        for i in range(0, numResponses):
            print("Found result (" + str(i) + "): " + rawLink[i])

        print("\n")
    
    # Send the message(s) out one at a time
    for i in range(0, numResponses):
        await message.channel.send(rawLink[i])

# Write config values to the config file
def writeConfig(parameter, value):
    success = False
    
    with open('GoogleBot.config', 'r') as configFile:
        oldConfigLines = configFile.readlines()
        newConfigLines = [0 for i in range(len(oldConfigLines))]

        for line in range(0, len(oldConfigLines)):
            if parameter.lower() in oldConfigLines[line]:
                newConfigLines[line] = parameter + ": " + str(value) + "\n"
                success = True
            else:
                newConfigLines[line] = oldConfigLines[line]

    with open('GoogleBot.config', 'w') as configFile:
        configFile.writelines(newConfigLines)
        
    if DEBUG:
        if success:
            print("Changed config value of " + parameter + " to " + str(value))
        else:
            print("Failed to change config value of " + parameter + " to " + str(value))

    return success

# Safe casting attempts
def safeCast(value, toType, default = None):
    try:
        return toType(value)
    except (ValueError, TypeError):
        return default