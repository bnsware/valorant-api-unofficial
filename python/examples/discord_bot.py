"""/rank slash command for Discord (discord.py 2.x).

pip install discord.py "git+https://github.com/bnsware/valorant-api-unofficial#subdirectory=python"
DISCORD_TOKEN=... UGIAPI_KEY=... python discord_bot.py
"""
import asyncio
import os

import discord
from discord import app_commands

from ugiapi import UgiApi, UgiApiError

api = UgiApi(os.environ["UGIAPI_KEY"], user_agent="my-rank-bot/1.0")
client = discord.Client(intents=discord.Intents.default())
tree = app_commands.CommandTree(client)


@tree.command(name="rank", description="Show a player's Valorant rank")
@app_commands.describe(name="Riot name", tag="Riot tag (without #)", region="eu, na, ap, kr, br, latam")
async def rank(interaction: discord.Interaction, name: str, tag: str, region: str = "eu"):
    await interaction.response.defer()
    try:
        # requests is blocking: run it in a thread so the bot stays responsive
        r = (await asyncio.to_thread(api.get_rank, region, name, tag)).data
    except UgiApiError as e:
        msg = "Player not found." if e.code == "player_not_found" else f"Error: {e.code}"
        return await interaction.followup.send(msg)
    cur = r["current_data"]
    embed = discord.Embed(title=f"{r['name']}#{r['tag']}", description=f"**{cur['currenttierpatched']}** · {cur['ranking_in_tier'] or 0} RR")
    embed.add_field(name="Peak", value=(r.get("peak") or {}).get("tier_patched", "-"))
    embed.add_field(name="Act", value=f"{cur['wins'] or 0}W / {cur['games'] or 0} games")
    if (cur.get("tier_details") or {}).get("icon"):
        embed.set_thumbnail(url=cur["tier_details"]["icon"])
    await interaction.followup.send(embed=embed)


@client.event
async def on_ready():
    await tree.sync()
    print(f"Logged in as {client.user}")


client.run(os.environ["DISCORD_TOKEN"])
