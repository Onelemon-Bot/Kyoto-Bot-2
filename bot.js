const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder, InteractionResponseFlags } = require('discord.js');
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
const CLIENT_ID = process.env.CLIENT_ID; // Add this to your .env file
const GUILD_ID = process.env.GUILD_ID; // Add this to your .env file (optional, for guild-specific commands)
const ANNOUNCEMENT_CHANNEL_ID = process.env.ANNOUNCEMENT_CHANNEL_ID;
const PATCH_NOTES_CHANNEL_ID = process.env.PATCH_NOTES_CHANNEL_ID;
const GAME_LINK = process.env.GAME_LINK; // Add your Roblox game link
const GROUP_LINK = process.env.GROUP_LINK; // Add your Roblox group link
const DISCORD_INVITE = process.env.DISCORD_INVITE; // Add your Discord invite link

// Roblox API Configuration
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY; // Open Cloud API Key
const UNIVERSE_ID = process.env.UNIVERSE_ID; // Your game's Universe ID
const PLACE_ID = process.env.PLACE_ID; // Your game's Place ID
const WEBHOOK_PORT = process.env.PORT || 3000; // Port for receiving game updates

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

// Roles that can make announcements (add role names)
const ALLOWED_ROLES = ['ＯＷＮＥＲ', 'Developer', 'Admin'];

// FAQ System - Add your frequently asked questions here
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
    status: 'online', // online, maintenance, issues
    message: 'All systems operational',
    lastUpdated: new Date(),
    playerCount: 0,
    activeServers: 0,
    lastGameUpdate: new Date()
};

// Function to fetch live game data from Roblox API
// Updated function to fetch live game data from Roblox API
async function fetchRobloxGameData() {
    if (!UNIVERSE_ID) {
        console.log('Universe ID not configured - using manual status only');
        return null;
    }

    try {
        // Method 1: Get game info using the public Games API (no API key needed)
        const gameInfoResponse = await fetch(`https://games.roblox.com/v1/games?universeIds=${UNIVERSE_ID}`);
        
        if (gameInfoResponse.ok) {
            const gameData = await gameInfoResponse.json();
            
            if (gameData.data && gameData.data.length > 0) {
                const game = gameData.data[0];
                const totalPlayers = game.playing || 0;
                
                // Update game status with live data
                gameStatus.playerCount = totalPlayers;
                gameStatus.lastGameUpdate = new Date();
                
                // Try to get server count using thumbnails API (indirect method)
                try {
                    const thumbnailResponse = await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${UNIVERSE_ID}&returnPolicy=PlaceHolder&size=256x256&format=Png&isCircular=false`);
                    if (thumbnailResponse.ok) {
                        // If we can get thumbnail data, game is likely online
                        gameStatus.activeServers = totalPlayers > 0 ? Math.ceil(totalPlayers / 10) : 0; // Estimate servers
                    }
                } catch (thumbError) {
                    console.log('Could not estimate server count');
                    gameStatus.activeServers = 0;
                }

                // Auto-detect if game is down
                if (totalPlayers === 0 && gameStatus.status === 'online') {
                    // Don't immediately mark as down, could just be low player count
                    console.log('Low player count detected, but not marking as down');
                } else if (totalPlayers > 0 && gameStatus.status === 'issues') {
                    gameStatus.status = 'online';
                    gameStatus.message = 'All systems operational';
                    gameStatus.lastUpdated = new Date();
                }

                console.log(`Game data updated: ${totalPlayers} players online`);
                return { totalPlayers, activeServers: gameStatus.activeServers };
            }
        }

        // Method 2: If you have Open Cloud API access, use this instead
        if (ROBLOX_API_KEY) {
            console.log('Trying Open Cloud API...');
            
            // Note: This is for DataStore access, not game instances
            // For game statistics, you'd need to implement custom tracking in your game
            // and send data to your webhook endpoint
            
            const response = await fetch(`https://apis.roblox.com/cloud/v2/universes/${UNIVERSE_ID}/data-stores`, {
                headers: {
                    'x-api-key': ROBLOX_API_KEY,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                console.log('Open Cloud API accessible - you can implement custom game tracking');
                // You would need to store player count data in a DataStore from your game
                // and retrieve it here
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

// Alternative: Enhanced webhook method for accurate data
// Add this to your Roblox game script to send real-time data:

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
                    
                    // Update game status with data from Roblox
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
    // Check if user is server owner
    if (member.guild.ownerId === member.id) {
        return true;
    }
    
    // Check if user has Administrator permission
    if (member.permissions.has('Administrator')) {
        return true;
    }
    
    // Check if user has any of the allowed roles
    return ALLOWED_ROLES.some(roleName => {
        return member.roles.cache.some(role => role.name === roleName);
    });
}

// Define slash commands
const commands = [
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
];

// Register slash commands
const rest = new REST({ version: '10' }).setToken(TOKEN);

async function deployCommands() {
    try {
        console.log('Started refreshing application (/) commands.');

        // For guild-specific commands (faster update)
        if (GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                { body: commands },
            );
        } else {
            // For global commands (takes up to 1 hour to update)
            await rest.put(
                Routes.applicationCommands(CLIENT_ID),
                { body: commands },
            );
        }

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
}

// When the client is ready, run this code
client.once('ready', async () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    console.log(`Bot is online and ready to make announcements!`);
    
    // Deploy commands when bot starts
    await deployCommands();
    
    // Start webhook server for game updates
    createWebhookServer();
    
    // Fetch live game data every 5 minutes if API is configured
    if (ROBLOX_API_KEY && UNIVERSE_ID) {
        console.log('Roblox API configured - starting live data fetching');
        setInterval(fetchRobloxGameData, 5 * 60 * 1000); // Every 5 minutes
        fetchRobloxGameData(); // Initial fetch
    } else {
        console.log('Roblox API not configured - using manual status updates only');
        console.log('Add ROBLOX_API_KEY and UNIVERSE_ID to .env file for live game data');
    }
});

// Handle slash command interactions
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'announce') {
        // Check if user has permission to make announcements
        const member = interaction.member;
        if (!hasAnnouncementPermission(member)) {
            return await interaction.reply({
                content: 'You don\'t have permission to make announcements!',
                flags: InteractionResponseFlags.Ephemeral
            });
        }

        // Get the announcement message
        const announcementText = interaction.options.getString('message');
        
        // Get the announcement channel
        const announcementChannel = client.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID);
        
        if (!announcementChannel) {
            return await interaction.reply({
                content: 'Announcement channel not found! Please contact an administrator.',
                flags: InteractionResponseFlags.Ephemeral
            });
        }

        try {
            // Send the announcement
            await announcementChannel.send(announcementText);
            
            // Confirm to the user (only they can see this)
            await interaction.reply({
                content: 'Announcement sent successfully!',
                flags: InteractionResponseFlags.Ephemeral
            });
            
        } catch (error) {
            console.error('Error sending announcement:', error);
            await interaction.reply({
                content: 'Failed to send announcement. Please try again.',
                flags: InteractionResponseFlags.Ephemeral
            });
        }
    }

    if (interaction.commandName === 'maintenance') {
        // Check if user has permission
        const member = interaction.member;
        if (!hasAnnouncementPermission(member)) {
            return await interaction.reply({
                content: 'You don\'t have permission to announce maintenance!',
                flags: InteractionResponseFlags.Ephemeral
            });
        }

        const duration = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'Scheduled maintenance';
        const endTime = interaction.options.getString('end_time');

        // Get the announcement channel
        const announcementChannel = client.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID);
        
        if (!announcementChannel) {
            return await interaction.reply({
                content: 'Announcement channel not found! Please contact an administrator.',
                flags: InteractionResponseFlags.Ephemeral
            });
        }

        try {
            let maintenanceEmbed = new EmbedBuilder()
                .setTitle('🔧 Scheduled Maintenance')
                .setDescription(`**The game will be undergoing maintenance.**\n\n**Duration:** ${duration}\n**Reason:** ${reason}`)
                .setColor('#FF9500')
                .setTimestamp()
                .setFooter({ text: 'We apologize for any inconvenience' });

            // Add end time if provided (Discord will auto-convert to user's timezone)
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

            // Update game status
            gameStatus = {
                status: 'maintenance',
                message: `Maintenance in progress: ${reason}`,
                lastUpdated: new Date()
            };

            await announcementChannel.send({ embeds: [maintenanceEmbed] });
            
            await interaction.reply({
                content: 'Maintenance announcement sent successfully!',
                flags: InteractionResponseFlags.Ephemeral
            });
            
        } catch (error) {
            console.error('Error sending maintenance announcement:', error);
            await interaction.reply({
                content: 'Failed to send maintenance announcement. Please try again.',
                flags: InteractionResponseFlags.Ephemeral
            });
        }
    }

    if (interaction.commandName === 'gamestatus') {
        // Fetch latest data before showing status
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

        // Add live game data if available
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

        // Show when game data was last updated
        if (gameStatus.lastGameUpdate) {
            const timeDiff = Math.floor((new Date() - gameStatus.lastGameUpdate) / 1000 / 60);
            statusEmbed.addFields({
                name: '🔄 Game Data',
                value: timeDiff < 1 ? 'Just updated' : `Updated ${timeDiff} minutes ago`,
                inline: true
            });
        }

        await interaction.reply({ embeds: [statusEmbed] });
    }

    if (interaction.commandName === 'setstatus') {
        // Check if user has permission
        const member = interaction.member;
        if (!hasAnnouncementPermission(member)) {
            return await interaction.reply({
                content: 'You don\'t have permission to update game status!',
                flags: InteractionResponseFlags.Ephemeral
            });
        }

        const status = interaction.options.getString('status');
        const message = interaction.options.getString('message');

        gameStatus = {
            status: status,
            message: message,
            lastUpdated: new Date()
        };

        await interaction.reply({
            content: `Game status updated to: ${status} - ${message}`,
            flags: InteractionResponseFlags.Ephemeral
        });
    }

    if (interaction.commandName === 'faq') {
        const topic = interaction.options.getString('topic');
        const faqItem = FAQ_DATA[topic];

        if (!faqItem) {
            return await interaction.reply({
                content: 'FAQ topic not found!',
                flags: InteractionResponseFlags.Ephemeral
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

        // Add game link if available
        if (GAME_LINK) {
            linksEmbed.addFields({
                name: '🎮 Play Game',
                value: `[Click here to play!](${GAME_LINK})`,
                inline: true
            });
        }

        // Add group link if available
        if (GROUP_LINK) {
            linksEmbed.addFields({
                name: '👥 Roblox Group',
                value: `[Join our group!](${GROUP_LINK})`,
                inline: true
            });
        }

        // Add Discord invite if available
        if (DISCORD_INVITE) {
            linksEmbed.addFields({
                name: '💬 Discord Server',
                value: `[Invite friends!](${DISCORD_INVITE})`,
                inline: true
            });
        }

        // Add placeholder links if env variables aren't set
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
        // Check if user has permission to make patch notes
        const member = interaction.member;
        if (!hasAnnouncementPermission(member)) {
            return await interaction.reply({
                content: 'You don\'t have permission to create patch notes! You need one of these roles: ' + ALLOWED_ROLES.join(', '),
                flags: InteractionResponseFlags.Ephemeral
            });
        }

        // Get all the options
        const version = interaction.options.getString('version');
        const title = interaction.options.getString('title') || 'Update';
        const content = interaction.options.getString('content');
        const balance = interaction.options.getString('balance');
        const bugfixes = interaction.options.getString('bugfixes');
        const other = interaction.options.getString('other');
        const colorInput = interaction.options.getString('color');

        // Parse color
        let embedColor = '#5865F2'; // Default Discord blue
        if (colorInput) {
            if (colorInput.startsWith('#')) {
                embedColor = colorInput;
            } else {
                // Handle color names
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

        // Get the patch notes channel
        const patchNotesChannel = client.channels.cache.get(PATCH_NOTES_CHANNEL_ID);
        
        if (!patchNotesChannel) {
            return await interaction.reply({
                content: 'Patch notes channel not found! Please contact an administrator.',
                flags: InteractionResponseFlags.Ephemeral
            });
        }

        try {
            const embeds = [];

            // Create header embed with version and title - CHANGED "Patch Notes" to "Update Log"
            const headerEmbed = new EmbedBuilder()
                .setTitle(`Update Log ${version}`)
                .setDescription(title)
                .setColor(embedColor)
                .setTimestamp()
                .setFooter({ text: 'Update Log' });
            
            embeds.push(headerEmbed);

            // Create separate embeds for each section
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
                // Parse custom section (format: SectionName::item1|item2|item3)
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

            // Send all embeds as separate messages
            for (const embed of embeds) {
                await patchNotesChannel.send({ embeds: [embed] });
                // Small delay between messages to maintain order
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Confirm to the user
            await interaction.reply({
                content: 'Patch notes sent successfully!',
                flags: InteractionResponseFlags.Ephemeral
            });
            
        } catch (error) {
            console.error('Error sending patch notes:', error);
            await interaction.reply({
                content: 'Failed to send patch notes. Please try again.',
                flags: InteractionResponseFlags.Ephemeral
            });
        }
    }
});

// Error handling
client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Login to Discord with your client's token
client.login(TOKEN);