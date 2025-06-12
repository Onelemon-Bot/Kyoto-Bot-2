const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const https = require('https');
const http = require('http');
require('dotenv').config();

// Create a new client instance
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ] 
});

// Get configuration from .env file
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const ANNOUNCEMENT_CHANNEL_ID = process.env.ANNOUNCEMENT_CHANNEL_ID;
const PATCH_NOTES_CHANNEL_ID = process.env.PATCH_NOTES_CHANNEL_ID;
const SUGGESTIONS_CHANNEL_ID = process.env.SUGGESTIONS_CHANNEL_ID;
const GAME_LINK = process.env.GAME_LINK;
const GROUP_LINK = process.env.GROUP_LINK;
const DISCORD_INVITE = process.env.DISCORD_INVITE;

// Roblox API Configuration
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;
const UNIVERSE_ID = process.env.UNIVERSE_ID;
const PLACE_ID = process.env.PLACE_ID;
const WEBHOOK_PORT = process.env.PORT || 3000;

// Check for required environment variables
if (!TOKEN) {
    console.error('Error: DISCORD_TOKEN is not set in .env file');
    process.exit(1);
}

if (!CLIENT_ID) {
    console.error('Error: CLIENT_ID is not set in .env file');
    console.error('Get your Application ID from https://discord.com/developers/applications');
    process.exit(1);
}

if (!ANNOUNCEMENT_CHANNEL_ID) {
    console.error('Error: ANNOUNCEMENT_CHANNEL_ID is not set in .env file');
    process.exit(1);
}

if (!PATCH_NOTES_CHANNEL_ID) {
    console.error('Error: PATCH_NOTES_CHANNEL_ID is not set in .env file');
    process.exit(1);
}

// Roles that can make announcements
const ALLOWED_ROLES = ['ＯＷＮＥＲ', 'Developer', 'Admin'];

// FAQ System
const FAQ_DATA = {
    'When is the game coming out': {
        question: 'When is the game coming out?',
        answer: 'We have no current release date.'
    },
    'report-bug': {
        question: 'How do I report a bug?',
        answer: 'You can report bugs in our #bug-reports channel or contact a staff member directly. Please include screenshots if possible!'
    },
    'updates': {
        question: 'How often will you update?',
        answer: 'We have no current schedule for updates.'
    },
    'mobile-support': {
        question: 'Does the game work on mobile?',
        answer: 'Yes, we are planning on adding mobile support.'
    },
    'data-reset': {
        question: 'Will my data reset at anypoint?',
        answer: 'Most likely no.'
    }
};

// Game status tracking
let gameStatus = {
    status: 'online',
    message: 'All systems operational',
    lastUpdated: new Date(),
    playerCount: 0,
    activeServers: 0,
    lastGameUpdate: new Date()
};

// Suggestion system
let suggestions = new Map();
let suggestionCounter = 1;

// Function to fetch live game data from Roblox API
async function fetchRobloxGameData() {
    if (!UNIVERSE_ID) {
        console.log('Universe ID not configured - using manual status only');
        return null;
    }

    try {
        const gameInfoResponse = await fetch(`https://games.roblox.com/v1/games?universeIds=${UNIVERSE_ID}`);
        
        if (gameInfoResponse.ok) {
            const gameData = await gameInfoResponse.json();
            
            if (gameData.data && gameData.data.length > 0) {
                const game = gameData.data[0];
                const totalPlayers = game.playing || 0;
                
                gameStatus.playerCount = totalPlayers;
                gameStatus.lastGameUpdate = new Date();
                gameStatus.activeServers = totalPlayers > 0 ? Math.ceil(totalPlayers / 10) : 0;

                if (totalPlayers > 0 && gameStatus.status === 'issues') {
                    gameStatus.status = 'online';
                    gameStatus.message = 'All systems operational';
                    gameStatus.lastUpdated = new Date();
                }

                console.log(`Game data updated: ${totalPlayers} players online`);
                return { totalPlayers, activeServers: gameStatus.activeServers };
            }
        }

        if (ROBLOX_API_KEY) {
            console.log('Trying Open Cloud API...');
            
            const response = await fetch(`https://apis.roblox.com/cloud/v2/universes/${UNIVERSE_ID}/data-stores`, {
                headers: {
                    'x-api-key': ROBLOX_API_KEY,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                console.log('Open Cloud API accessible - you can implement custom game tracking');
            } else {
                console.log('Open Cloud API error:', response.status, response.statusText);
            }
        }

        return null;

    } catch (error) {
        console.error('Error fetching Roblox game data:', error);
        return null;
    }
}

// Create webhook server to receive updates from Roblox game
function createWebhookServer() {
    const server = http.createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/game-status') {
            let body = '';
            
            req.on('data', chunk => {
                body += chunk.toString();
            });
            
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    
                    if (data.playerCount !== undefined) {
                        gameStatus.playerCount = data.playerCount;
                    }
                    
                    if (data.status) {
                        gameStatus.status = data.status;
                        gameStatus.message = data.message || gameStatus.message;
                        gameStatus.lastUpdated = new Date();
                    }
                    
                    if (data.serverInfo) {
                        gameStatus.lastGameUpdate = new Date();
                    }
                    
                    console.log('Game status updated via webhook:', data);
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Status updated' }));
                    
                } catch (error) {
                    console.error('Error processing webhook data:', error);
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Invalid JSON' }));
                }
            });
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Not found' }));
        }
    });
    
    server.listen(WEBHOOK_PORT, () => {
        console.log(`Webhook server running on port ${WEBHOOK_PORT}`);
        console.log(`Game can send updates to: http://your-server.com:${WEBHOOK_PORT}/game-status`);
    });
    
    return server;
}

// Function to check if user has permission to announce
function hasAnnouncementPermission(member) {
    if (member.guild.ownerId === member.id) {
        return true;
    }
    
    if (member.permissions.has('Administrator')) {
        return true;
    }
    
    return ALLOWED_ROLES.some(roleName => {
        return member.roles.cache.some(role => role.name === roleName);
    });
}

// Define slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Test if bot is responding'),
    new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Make an announcement')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The announcement message')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('patchnotes')
        .setDescription('Create patch notes/update logs')
        .addStringOption(option =>
            option.setName('version')
                .setDescription('Version number (e.g., v1.2.3)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Patch title (e.g., "Major Update", "Bug Fixes")')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('content')
                .setDescription('Content & Systems changes (separate with | for new lines)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('balance')
                .setDescription('Balancing & Tweaks changes (separate with | for new lines)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('bugfixes')
                .setDescription('Bug Fixes (separate with | for new lines)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('other')
                .setDescription('Other changes with custom section name (format: SectionName::change1|change2)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('color')
                .setDescription('Embed color (hex code like #ff0000 or color name like blue)')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('maintenance')
        .setDescription('Announce maintenance mode')
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('How long maintenance will last (e.g., "30 minutes", "2 hours")')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for maintenance (e.g., "Bug fixes", "Server updates")')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('end_time')
                .setDescription('When maintenance ends (format: YYYY-MM-DD HH:MM, uses UTC if no timezone)')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('gamestatus')
        .setDescription('Check the current game status with live data'),
    new SlashCommandBuilder()
        .setName('setstatus')
        .setDescription('Update the game status (Admin only)')
        .addStringOption(option =>
            option.setName('status')
                .setDescription('Game status')
                .setRequired(true)
                .addChoices(
                    { name: '🟢 Online', value: 'online' },
                    { name: '🔧 Maintenance', value: 'maintenance' },
                    { name: '⚠️ Issues', value: 'issues' }
                )
        )
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Status message')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('faq')
        .setDescription('Get answers to frequently asked questions')
        .addStringOption(option =>
            option.setName('topic')
                .setDescription('Select a topic')
                .setRequired(true)
                .addChoices(
                    { name: 'How to Play', value: 'how-to-play' },
                    { name: 'Report a Bug', value: 'report-bug' },
                    { name: 'Game Updates', value: 'updates' },
                    { name: 'Mobile Support', value: 'mobile-support' },
                    { name: 'Data Reset', value: 'data-reset' }
                )
        ),
    new SlashCommandBuilder()
        .setName('links')
        .setDescription('Get important links for the game and community'),
    // Suggestion commands
    new SlashCommandBuilder()
        .setName('suggest')
        .setDescription('Submit a suggestion for the game')
        .addStringOption(option =>
            option.setName('suggestion')
                .setDescription('Your suggestion (max 1000 characters)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('category')
                .setDescription('What category is your suggestion?')
                .setRequired(false)
                .addChoices(
                    { name: '🎮 Gameplay', value: 'gameplay' },
                    { name: '🎨 Cosmetics', value: 'cosmetics' },
                    { name: '🔧 Features', value: 'features' },
                    { name: '🌍 Maps', value: 'maps' },
                    { name: '⚖️ Balance', value: 'balance' },
                    { name: '🐛 Bug Report', value: 'bug' },
                    { name: '💡 Other', value: 'other' }
                )
        ),
    new SlashCommandBuilder()
        .setName('suggestion-status')
        .setDescription('Update the status of a suggestion (Staff only)')
        .addIntegerOption(option =>
            option.setName('id')
                .setDescription('Suggestion ID number')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('status')
                .setDescription('New status for the suggestion')
                .setRequired(true)
                .addChoices(
                    { name: '✅ Approved', value: 'approved' },
                    { name: '❌ Denied', value: 'denied' },
                    { name: '🔄 Under Review', value: 'reviewing' },
                    { name: '✨ Implemented', value: 'implemented' },
                    { name: '⏳ Planned', value: 'planned' }
                )
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for status change (optional)')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('suggestion-info')
        .setDescription('Get detailed info about a suggestion')
        .addIntegerOption(option =>
            option.setName('id')
                .setDescription('Suggestion ID number')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('suggestions-list')
        .setDescription('List suggestions by status (Staff only)')
        .addStringOption(option =>
            option.setName('status')
                .setDescription('Filter by status')
                .setRequired(false)
                .addChoices(
                    { name: '⏳ Pending', value: 'pending' },
                    { name: '✅ Approved', value: 'approved' },
                    { name: '❌ Denied', value: 'denied' },
                    { name: '🔄 Under Review', value: 'reviewing' },
                    { name: '✨ Implemented', value: 'implemented' },
                    { name: '⏳ Planned', value: 'planned' }
                )
        )
];

// Register slash commands
const rest = new REST({ version: '10' }).setToken(TOKEN);

async function deployCommands() {
    try {
        console.log('Started refreshing application (/) commands.');

        // Clear existing commands first
        if (GUILD_ID) {
            console.log('Clearing existing guild commands...');
            await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                { body: [] }
            );
            
            console.log('Deploying new guild commands...');
            await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                { body: commands }
            );
            console.log(`Successfully deployed ${commands.length} guild commands.`);
        } else {
            console.log('Deploying global commands...');
            await rest.put(
                Routes.applicationCommands(CLIENT_ID),
                { body: commands }
            );
            console.log(`Successfully deployed ${commands.length} global commands.`);
        }

    } catch (error) {
        console.error('Error deploying commands:', error);
        if (error.code === 50001) {
            console.error('Bot is missing access to the guild. Make sure the bot is in the server.');
        }
    }
}

// When the client is ready, run this code
client.once('ready', async () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    console.log(`Bot ID: ${client.user.id}`);
    console.log(`Connected to ${client.guilds.cache.size} servers`);
    
    // Deploy commands when bot starts
    try {
        await deployCommands();
    } catch (error) {
        console.error('Failed to deploy commands:', error);
    }
    
    // Start webhook server for game updates
    try {
        createWebhookServer();
    } catch (error) {
        console.error('Failed to start webhook server:', error);
    }
    
    // Fetch live game data every 5 minutes if API is configured
    if (ROBLOX_API_KEY && UNIVERSE_ID) {
        console.log('Roblox API configured - starting live data fetching');
        setInterval(fetchRobloxGameData, 5 * 60 * 1000);
        fetchRobloxGameData();
    } else {
        console.log('Roblox API not configured - using manual status updates only');
    }
});

// Handle slash command interactions
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    console.log(`Received command: ${interaction.commandName} from ${interaction.user.tag}`);

    try {
        if (interaction.commandName === 'ping') {
            await interaction.reply({
                content: 'Pong! Bot is working correctly. 🏓',
                ephemeral: true
            });
            return;
        } catch (error) {
        console.error('Error handling command:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: 'An error occurred while processing your command.',
                ephemeral: true
            });
        }
    }


        if (interaction.commandName === 'announce') {
            const member = interaction.member;
            if (!hasAnnouncementPermission(member)) {
                return await interaction.reply({
                    content: 'You don\'t have permission to make announcements!',
                    ephemeral: true
                });
            }

            const announcementText = interaction.options.getString('message');
            const announcementChannel = client.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID);
            
            if (!announcementChannel) {
                return await interaction.reply({
                    content: 'Announcement channel not found! Please contact an administrator.',
                    ephemeral: true
                });
            }

            await announcementChannel.send(announcementText);
            await interaction.reply({
                content: 'Announcement sent successfully!',
                ephemeral: true
            });
        }

        if (interaction.commandName === 'maintenance') {
            const member = interaction.member;
            if (!hasAnnouncementPermission(member)) {
                return await interaction.reply({
                    content: 'You don\'t have permission to announce maintenance!',
                    ephemeral: true
                });
            }

            const duration = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason') || 'Scheduled maintenance';
            const endTime = interaction.options.getString('end_time');

            const announcementChannel = client.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID);
            
            if (!announcementChannel) {
                return await interaction.reply({
                    content: 'Announcement channel not found! Please contact an administrator.',
                    ephemeral: true
                });
            }

            let maintenanceEmbed = new EmbedBuilder()
                .setTitle('🔧 Scheduled Maintenance')
                .setDescription(`**The game will be undergoing maintenance.**\n\n**Duration:** ${duration}\n**Reason:** ${reason}`)
                .setColor('#FF9500')
                .setTimestamp()
                .setFooter({ text: 'We apologize for any inconvenience' });

            if (endTime) {
                try {
                    const endDate = new Date(endTime);
                    if (!isNaN(endDate.getTime())) {
                        const unixTimestamp = Math.floor(endDate.getTime() / 1000);
                        maintenanceEmbed.addFields({
                            name: '⏰ Maintenance Ends',
                            value: `<t:${unixTimestamp}:F> (<t:${unixTimestamp}:R>)`,
                            inline: false
                        });
                    }
                } catch (error) {
                    console.log('Invalid date format provided');
                }
            }

            gameStatus = {
                status: 'maintenance',
                message: `Maintenance in progress: ${reason}`,
                lastUpdated: new Date()
            };

            await announcementChannel.send({ embeds: [maintenanceEmbed] });
            await interaction.reply({
                content: 'Maintenance announcement sent successfully!',
                ephemeral: true
            });
        }

        if (interaction.commandName === 'gamestatus') {
            await interaction.deferReply();
            
            await fetchRobloxGameData();
            
            const statusEmojis = {
                'online': '🟢',
                'maintenance': '🔧',
                'issues': '⚠️'
            };

            const statusColors = {
                'online': '#00FF00',
                'maintenance': '#FF9500',
                'issues': '#FF0000'
            };

            const statusEmbed = new EmbedBuilder()
                .setTitle(`${statusEmojis[gameStatus.status]} Game Status`)
                .setDescription(gameStatus.message)
                .setColor(statusColors[gameStatus.status])
                .setTimestamp(gameStatus.lastUpdated)
                .setFooter({ text: 'Last updated' });

            if (gameStatus.playerCount > 0 || gameStatus.activeServers > 0) {
                statusEmbed.addFields(
                    {
                        name: '👥 Players Online',
                        value: gameStatus.playerCount.toString(),
                        inline: true
                    },
                    {
                        name: '🖥️ Active Servers',
                        value: gameStatus.activeServers.toString(),
                        inline: true
                    }
                );
            }

            if (gameStatus.lastGameUpdate) {
                const timeDiff = Math.floor((new Date() - gameStatus.lastGameUpdate) / 1000 / 60);
                statusEmbed.addFields({
                    name: '🔄 Game Data',
                    value: timeDiff < 1 ? 'Just updated' : `Updated ${timeDiff} minutes ago`,
                    inline: true
                });
            }

            await interaction.editReply({ embeds: [statusEmbed] });
        }

        if (interaction.commandName === 'setstatus') {
            const member = interaction.member;
            if (!hasAnnouncementPermission(member)) {
                return await interaction.reply({
                    content: 'You don\'t have permission to update game status!',
                    ephemeral: true
                });
            }

            const status = interaction.options.getString('status');
            const message = interaction.options.getString('message');

            gameStatus = {
                status: status,
                message: message,
                lastUpdated: new Date(),
                playerCount: gameStatus.playerCount,
                activeServers: gameStatus.activeServers,
                lastGameUpdate: gameStatus.lastGameUpdate
            };

            await interaction.reply({
                content: `Game status updated to: ${status} - ${message}`,
                ephemeral: true
            });
        }

        if (interaction.commandName === 'faq') {
            const topic = interaction.options.getString('topic');
            const faqItem = FAQ_DATA[topic];

            if (!faqItem) {
                return await interaction.reply({
                    content: 'FAQ topic not found!',
                    ephemeral: true
                });
            }

            const faqEmbed = new EmbedBuilder()
                .setTitle(`❓ ${faqItem.question}`)
                .setDescription(faqItem.answer)
                .setColor('#5865F2')
                .setTimestamp()
                .setFooter({ text: 'Frequently Asked Questions' });

            await interaction.reply({ embeds: [faqEmbed] });
        }

        if (interaction.commandName === 'links') {
            const linksEmbed = new EmbedBuilder()
                .setTitle('🔗 Important Links')
                .setDescription('Here are all the important links for our community!')
                .setColor('#5865F2')
                .setTimestamp();

            if (GAME_LINK) {
                linksEmbed.addFields({
                    name: '🎮 Play Game',
                    value: `[Click here to play!](${GAME_LINK})`,
                    inline: true
                });
            }

            if (GROUP_LINK) {
                linksEmbed.addFields({
                    name: '👥 Roblox Group',
                    value: `[Join our group!](${GROUP_LINK})`,
                    inline: true
                });
            }

            if (DISCORD_INVITE) {
                linksEmbed.addFields({
                    name: '💬 Discord Server',
                    value: `[Invite friends!](${DISCORD_INVITE})`,
                    inline: true
                });
            }

            if (!GAME_LINK || !GROUP_LINK || !DISCORD_INVITE) {
                linksEmbed.addFields({
                    name: '⚙️ Setup Required',
                    value: 'Some links need to be configured in the .env file',
                    inline: false
                });
            }

            await interaction.reply({ embeds: [linksEmbed] });
        }

        if (interaction.commandName === 'patchnotes') {
            const member = interaction.member;
            if (!hasAnnouncementPermission(member)) {
                return await interaction.reply({
                    content: 'You don\'t have permission to create patch notes! You need one of these roles: ' + ALLOWED_ROLES.join(', '),
                    ephemeral: true
                });
            }

            const version = interaction.options.getString('version');
            const title = interaction.options.getString('title') || 'Update';
            const content = interaction.options.getString('content');
            const balance = interaction.options.getString('balance');
            const bugfixes = interaction.options.getString('bugfixes');
            const other = interaction.options.getString('other');
            const colorInput = interaction.options.getString('color');

            let embedColor = '#5865F2';
            if (colorInput) {
                if (colorInput.startsWith('#')) {
                    embedColor = colorInput;
                } else {
                    const colorMap = {
                        'red': '#FF0000', 'green': '#00FF00', 'blue': '#0000FF',
                        'yellow': '#FFFF00', 'purple': '#800080', 'orange': '#FFA500',
                        'pink': '#FFC0CB', 'cyan': '#00FFFF', 'lime': '#32CD32',
                        'magenta': '#FF00FF', 'brown': '#A52A2A', 'grey': '#808080',
                        'gray': '#808080', 'black': '#000000', 'white': '#FFFFFF'
                    };
                    embedColor = colorMap[colorInput.toLowerCase()] || embedColor;
                }
            }

            const patchNotesChannel = client.channels.cache.get(PATCH_NOTES_CHANNEL_ID);
            
            if (!patchNotesChannel) {
                return await interaction.reply({
                    content: 'Patch notes channel not found! Please contact an administrator.',
                    ephemeral: true
                });
            }

            const embeds = [];

            const headerEmbed = new EmbedBuilder()
                .setTitle(`Update Log ${version}`)
                .setDescription(title)
                .setColor(embedColor)
                .setTimestamp()
                .setFooter({ text: 'Update Log' });
            
            embeds.push(headerEmbed);

            if (content) {
                const contentList = content.split('|').map(item => `• ${item.trim()}`).join('\n');
                const contentEmbed = new EmbedBuilder()
                    .setTitle('Content & Systems')
                    .setDescription(contentList)
                    .setColor(embedColor);
                embeds.push(contentEmbed);
            }

            if (balance) {
                const balanceList = balance.split('|').map(item => `• ${item.trim()}`).join('\n');
                const balanceEmbed = new EmbedBuilder()
                    .setTitle('Balancing & Tweaks')
                    .setDescription(balanceList)
                    .setColor(embedColor);
                embeds.push(balanceEmbed);
            }

            if (bugfixes) {
                const bugfixList = bugfixes.split('|').map(item => `• ${item.trim()}`).join('\n');
                const bugfixEmbed = new EmbedBuilder()
                    .setTitle('Bug Fixes')
                    .setDescription(bugfixList)
                    .setColor(embedColor);
                embeds.push(bugfixEmbed);
            }

            if (other) {
                const [sectionName, ...items] = other.split('::');
                if (items.length > 0) {
                    const itemList = items.join('::').split('|').map(item => `• ${item.trim()}`).join('\n');
                    const otherEmbed = new EmbedBuilder()
                        .setTitle(sectionName.trim())
                        .setDescription(itemList)
                        .setColor(embedColor);
                    embeds.push(otherEmbed);
                }
            }

            for (const embed of embeds) {
                await patchNotesChannel.send({ embeds: [embed] });
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            await interaction.reply({
                content: 'Patch notes sent successfully!',
                ephemeral: true
            });
        }

        // Suggestion System Commands
        if (interaction.commandName === 'suggest') {
            const suggestionText = interaction.options.getString('suggestion');
            const category = interaction.options.getString('category') || 'other';
            
            if (suggestionText.length > 1000) {
                return await interaction.reply({
                    content: 'Suggestion is too long! Please keep it under 1000 characters.',
                    ephemeral: true
                });
            }
            
            const suggestionsChannel = client.channels.cache.get(SUGGESTIONS_CHANNEL_ID);
            if (!suggestionsChannel) {
                return await interaction.reply({
                    content: 'Suggestions channel not configured! Please contact an administrator.',
                    ephemeral: true
                });
            }
            
            const suggestionId = suggestionCounter++;
            const categoryEmojis = {
                'gameplay': '🎮', 'cosmetics': '🎨', 'features': '🔧',
                'maps': '🌍', 'balance': '⚖️', 'bug': '🐛', 'other': '💡'
            };
            
            const suggestionEmbed = new EmbedBuilder()
                .setTitle(`${categoryEmojis[category]} Suggestion #${suggestionId}`)
                .setDescription(suggestionText)
                .setColor('#5865F2')
                .setAuthor({ 
                    name: interaction.user.tag, 
                    iconURL: interaction.user.displayAvatarURL() 
                })
                .addFields(
                    {
                        name: '📊 Status',
                        value: '⏳ Pending Review',
                        inline: true
                    },
                    {
                        name: '📂 Category',
                        value: `${categoryEmojis[category]} ${category.charAt(0).toUpperCase() + category.slice(1)}`,
                        inline: true
                    },
                    {
                        name: '🗳️ Votes',
                        value: '👍 0 | 👎 0',
                        inline: true
                    }
                )
                .setTimestamp()
                .setFooter({ text: `Suggestion ID: ${suggestionId}` });
            
            const suggestionMessage = await suggestionsChannel.send({ embeds: [suggestionEmbed] });
            
            // Add voting reactions
            await suggestionMessage.react('👍');
            await suggestionMessage.react('👎');
            
            // Store suggestion data
            suggestions.set(suggestionId, {
                id: suggestionId,
                text: suggestionText,
                category: category,
                author: {
                    id: interaction.user.id,
                    tag: interaction.user.tag,
                    avatar: interaction.user.displayAvatarURL()
                },
                status: 'pending',
                reason: null,
                messageId: suggestionMessage.id,
                upvotes: 0,
                downvotes: 0,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            
            await interaction.reply({
                content: `✅ Your suggestion has been submitted! (ID: #${suggestionId})\nOthers can now vote on it in <#${SUGGESTIONS_CHANNEL_ID}>`,
                ephemeral: true
            });
        }

        if (interaction.commandName === 'suggestion-status') {
            const member = interaction.member;
            if (!hasAnnouncementPermission(member)) {
                return await interaction.reply({
                    content: 'You don\'t have permission to manage suggestions!',
                    ephemeral: true
                });
            }
            
            const suggestionId = interaction.options.getInteger('id');
            const newStatus = interaction.options.getString('status');
            const reason = interaction.options.getString('reason');
            
            const suggestion = suggestions.get(suggestionId);
            if (!suggestion) {
                return await interaction.reply({
                    content: `Suggestion #${suggestionId} not found!`,
                    ephemeral: true
                });
            }
            
            const suggestionsChannel = client.channels.cache.get(SUGGESTIONS_CHANNEL_ID);
            if (!suggestionsChannel) {
                return await interaction.reply({
                    content: 'Suggestions channel not found!',
                    ephemeral: true
                });
            }
            
            try {
                const suggestionMessage = await suggestionsChannel.messages.fetch(suggestion.messageId);
                
                const statusEmojis = {
                    'pending': '⏳', 'approved': '✅', 'denied': '❌',
                    'reviewing': '🔄', 'implemented': '✨', 'planned': '⏳'
                };
                
                const statusColors = {
                    'pending': '#5865F2', 'approved': '#00FF00', 'denied': '#FF0000',
                    'reviewing': '#FF9500', 'implemented': '#FFD700', 'planned': '#9932CC'
                };
                
                const categoryEmojis = {
                    'gameplay': '🎮', 'cosmetics': '🎨', 'features': '🔧',
                    'maps': '🌍', 'balance': '⚖️', 'bug': '🐛', 'other': '💡'
                };
                
                // Count current reactions for votes
                const upvotes = suggestionMessage.reactions.cache.get('👍')?.count - 1 || 0;
                const downvotes = suggestionMessage.reactions.cache.get('👎')?.count - 1 || 0;
                
                const updatedEmbed = new EmbedBuilder()
                    .setTitle(`${categoryEmojis[suggestion.category]} Suggestion #${suggestionId}`)
                    .setDescription(suggestion.text)
                    .setColor(statusColors[newStatus])
                    .setAuthor({ 
                        name: suggestion.author.tag, 
                        iconURL: suggestion.author.avatar 
                    })
                    .addFields(
                        {
                            name: '📊 Status',
                            value: `${statusEmojis[newStatus]} ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`,
                            inline: true
                        },
                        {
                            name: '📂 Category',
                            value: `${categoryEmojis[suggestion.category]} ${suggestion.category.charAt(0).toUpperCase() + suggestion.category.slice(1)}`,
                            inline: true
                        },
                        {
                            name: '🗳️ Votes',
                            value: `👍 ${upvotes} | 👎 ${downvotes}`,
                            inline: true
                        }
                    )
                    .setTimestamp(suggestion.createdAt)
                    .setFooter({ text: `Suggestion ID: ${suggestionId} | Updated by ${interaction.user.tag}` });
                
                if (reason) {
                    updatedEmbed.addFields({
                        name: '📝 Staff Note',
                        value: reason,
                        inline: false
                    });
                }
                
                await suggestionMessage.edit({ embeds: [updatedEmbed] });
                
                // Update stored suggestion
                suggestion.status = newStatus;
                suggestion.reason = reason;
                suggestion.updatedAt = new Date();
                suggestion.upvotes = upvotes;
                suggestion.downvotes = downvotes;
                
                // If denied or implemented, remove reactions to prevent further voting
                if (newStatus === 'denied' || newStatus === 'implemented') {
                    await suggestionMessage.reactions.removeAll();
                }
                
                await interaction.reply({
                    content: `✅ Suggestion #${suggestionId} status updated to: ${statusEmojis[newStatus]} ${newStatus}`,
                    ephemeral: true
                });
                
            } catch (error) {
                console.error('Error updating suggestion:', error);
                await interaction.reply({
                    content: 'Error updating suggestion. The message may have been deleted.',
                    ephemeral: true
                });
            }
        }

        if (interaction.commandName === 'suggestion-info') {
    const suggestionId = interaction.options.getInteger('id');
    const suggestion = suggestions.get(suggestionId);
    
    if (!suggestion) {
        return await interaction.reply({
            content: `Suggestion #${suggestionId} not found!`,
            ephemeral: true
        });
    }
    
    const statusEmojis = {
        'pending': '⏳', 'approved': '✅', 'denied': '❌',
        'reviewing': '🔄', 'implemented': '✨', 'planned': '⏳'
    };
    
    const infoEmbed = new EmbedBuilder()
        .setTitle(`📋 Suggestion #${suggestionId} Details`)
        .setDescription(suggestion.text)
        .setColor('#5865F2')
        .addFields(
            {
                name: '👤 Author',
                value: suggestion.author.tag,
                inline: true
            },
            {
                name: '📊 Status',
                value: `${statusEmojis[suggestion.status]} ${suggestion.status.charAt(0).toUpperCase() + suggestion.status.slice(1)}`,
                inline: true
            },
            {
                name: '🗳️ Votes',
                value: `👍 ${suggestion.upvotes} | 👎 ${suggestion.downvotes}`,
                inline: true
            },
            {
                name: '📅 Created',
                value: `<t:${Math.floor(suggestion.createdAt.getTime() / 1000)}:F>`,
                inline: true
            },
            {
                name: '🔄 Last Updated',
                value: `<t:${Math.floor(suggestion.updatedAt.getTime() / 1000)}:R>`,
                inline: true
            }
        );
    
    if (suggestion.reason) {
        infoEmbed.addFields({
            name: '📝 Staff Note',
            value: suggestion.reason,
            inline: false
        });
    }
    
    await interaction.reply({ embeds: [infoEmbed], ephemeral: true });
}

// ... (previous code remains the same until the last part)

if (interaction.commandName === 'suggestions-list') {
    const member = interaction.member;
    if (!hasAnnouncementPermission(member)) {
        return await interaction.reply({
            content: 'You don\'t have permission to view the suggestions list!',
            ephemeral: true
        });
    }
    
    const statusFilter = interaction.options.getString('status');
    let filteredSuggestions = Array.from(suggestions.values());
    
    if (statusFilter) {
        filteredSuggestions = filteredSuggestions.filter(s => s.status === statusFilter);
    }
    
    filteredSuggestions.sort((a, b) => b.createdAt - a.createdAt);
    
    const statusEmojis = {
        'pending': '⏳', 'approved': '✅', 'denied': '❌',
        'reviewing': '🔄', 'implemented': '✨', 'planned': '⏳'
    };
    
    if (filteredSuggestions.length === 0) {
        return await interaction.reply({
            content: statusFilter ? 
                `No suggestions found with status: ${statusFilter}` : 
                'No suggestions found!',
            ephemeral: true
        });
    }
    
    const itemsPerPage = 10;
    const totalPages = Math.ceil(filteredSuggestions.length / itemsPerPage);
    const currentPage = filteredSuggestions.slice(0, itemsPerPage);
    
    const listEmbed = new EmbedBuilder()
        .setTitle(`📋 Suggestions List ${statusFilter ? `(${statusFilter})` : ''}`)
        .setColor('#5865F2')
        .setFooter({ text: `Page 1/${totalPages} | Total: ${filteredSuggestions.length}` });
    
    const suggestionList = currentPage.map(s => 
        `**#${s.id}** ${statusEmojis[s.status]} by ${s.author.tag}\n└ ${s.text.substring(0, 80)}${s.text.length > 80 ? '...' : ''}`
    ).join('\n\n');
    
    listEmbed.setDescription(suggestionList);
    
    await interaction.reply({ embeds: [listEmbed], ephemeral: true });
}
}); // This closes the interactionCreate event handler

// Error handling
client.on('error', error => {
    console.error('Discord client error:', error);
});

client.on('warn', warning => {
    console.warn('Discord client warning:', warning);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});

// Login to Discord with your client's token
client.login(TOKEN).catch(error => {
    console.error('Failed to login:', error);
    process.exit(1);
});