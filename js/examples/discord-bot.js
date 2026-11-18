// /rank slash command for Discord (discord.js v14).
// npm i discord.js github:bnsware/valorant-api-unofficial
// DISCORD_TOKEN=... UGIAPI_KEY=... node discord-bot.js
// Register a "rank" command with string options "name", "tag" and "region" first.
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import { UgiApi, UgiApiError } from 'ugiapi';

const api = new UgiApi({ apiKey: process.env.UGIAPI_KEY, userAgent: 'my-rank-bot/1.0' });
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'rank') return;
  await interaction.deferReply();
  const name = interaction.options.getString('name', true);
  const tag = interaction.options.getString('tag', true);
  const region = interaction.options.getString('region') ?? 'eu';
  try {
    const [{ data: rank }, { data: hist }] = await Promise.all([
      api.getRank({ region, name, tag }),
      api.getRankHistory({ region, name, tag, size: 5 }),
    ]);
    const c = rank.current_data;
    const last = hist.history.map((h) => (h.ranked_rating_earned > 0 ? `+${h.ranked_rating_earned}` : `${h.ranked_rating_earned ?? '?'}`)).join(' ');
    const embed = new EmbedBuilder()
      .setTitle(`${rank.name}#${rank.tag}`)
      .setDescription(`**${c.currenttierpatched}** · ${c.ranking_in_tier ?? 0} RR`)
      .addFields(
        { name: 'Peak', value: rank.peak?.tier_patched ?? '-', inline: true },
        { name: 'Act', value: `${c.wins ?? 0}W / ${c.games ?? 0} games`, inline: true },
        { name: 'Last 5', value: last || '-', inline: false },
      );
    if (c.tier_details?.icon) embed.setThumbnail(c.tier_details.icon);
    await interaction.editReply({ embeds: [embed] });
  } catch (e) {
    if (e instanceof UgiApiError && e.code === 'player_not_found') return interaction.editReply('Player not found.');
    if (e instanceof UgiApiError && e.status === 429) return interaction.editReply(`Busy, try again in ${e.retryAfter ?? 60}s.`);
    console.error(e);
    await interaction.editReply('Something went wrong.');
  }
});

client.login(process.env.DISCORD_TOKEN);
