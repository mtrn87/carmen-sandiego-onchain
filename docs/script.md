Here is the **full English translation** of `script.md`, preserving structure, tone, and game-design intent.
Source file: 

---

# Scenario 1 Script: **“The Heist of the Lost CryptoPunk”**

Complete guide for image generation and narrative of the first scenario.

---

## Initial Briefing (Mission Screen)

> **ACME DETECTIVE AGENCY ALERT**
>
> Attention, detective. Carmen Sandiego’s gang has struck again! In China, the gang stole the legendary **CryptoPunk #7804** — valued at **4,200 ETH** — from the digital vault of the collector known as **“The Vault”** on the Ethereum network.
>
> The heist was executed through a coordinated **flash loan**, temporarily draining liquidity from the custody protocol and allowing the NFT to be transferred to an unknown wallet in less than **12 seconds**.
>
> Our last lead indicates she passed through the **Ethereum** network heading toward **Polygon**. In the Ethereum contract `0xCarmenVault...` you may find additional information — our analysts detected a suspicious **bridge transaction** targeting a DeFi protocol on Polygon.
>
> The NFT has already left Ethereum. Carmen is on the move.
> **Good luck, detective.**

---

## Route Map

```
                        ETHEREUM (HQ)
                        [THEFT HERE]
                             |
                    bridge via CCIP
                             |
                  ┌──────────┼──────────┐
                  |          |          |
              OPTIMISM    POLYGON    ARBITRUM
              London🎡   Paris🗼    Tokyo🗾
              [FALSE]    [TRUE]     [FALSE]
                             |
                  ┌──────────┼──────────┐
                  |          |          |
              POLYGON     ARBITRUM   OPTIMISM
              Paris🗼     Tokyo🗾   London🎡
              [FALSE]    [TRUE]     [FALSE]
                             |
                  ┌──────────┼──────────┐
                  |          |          |
              ARBITRUM     BASE     POLYGON
              Tokyo🗾     NYC🗽    Paris🗼
              [FALSE]    [TRUE]     [FALSE]
                             |
                          CAPTURE!
```

---

## STAGE 1: Ethereum → Next Destination

The player starts on Ethereum and must determine where Carmen went.

### CORRECT Path → Polygon (Paris)

**Clue in the Ethereum contract:**
A bridge transaction shows the NFT was sent via CCIP to Polygon. Contract logs contain a hex-encoded message that, when decoded, reveals:

> *“The lady in red crossed the bridge toward the City of Light. She swapped her tokens in a pool near the tower.”*

**Visual evidence:** Security-camera image (DALL-E) showing a red-clad figure crossing a digital bridge with a pixelated Eiffel Tower in the background.

---

### FALSE Path 1 → Optimism (London)

**Fake clue in the Ethereum contract:**
A decoy transaction shows a transfer to Optimism. Logs state:

> *“Transfer detected to a lending protocol. Suspect seen near a large observation wheel.”*

**Why it’s false:**
The “large wheel” suggests the London Eye, but investigation on Optimism reveals only an abandoned contract with the message:

> *“Carmen was never here. Better luck next time, detective.”*

**Trap:**
Transaction value is **0.1887 ETH** — a reference to the year the Tower Bridge was built, reinforcing the false London lead.

---

### FALSE Path 2 → Arbitrum (Tokyo)

**Fake clue in the Ethereum contract:**
Another decoy transaction points to Arbitrum. Logs show:

> *“Flash loan executed with surgical precision. Attacker signature contains non-Latin characters.”*

**Why it’s false:**
“Non-Latin characters” hint at Japanese/Tokyo, but investigation on Arbitrum reveals a troll NFT of Carmen sticking out her tongue with the text:

> *“Too fast, detective. I’m not in Tokyo… yet.”*

**Trap:**
The transaction timestamp converted to UTC+9 (Tokyo time zone) equals **00:00**, reinforcing the false connection.

---

## STAGE 2: Polygon (Paris) → Next Destination

The player is now on Polygon investigating a DeFi protocol.

### CORRECT Path → Arbitrum (Tokyo)

**Clue in the DeFi protocol (Polygon):**
Carmen executed a swap in a liquidity pool. The exact value was **0.1868 ETH** (the year the Meiji era began in Japan). Contract logs include an AI-generated clue:

> *“A witness at the digital art market saw a woman in red swapping tokens. She asked about ‘hanami season’ and said she needed ‘ramen before the next flight.’ A taxi driver confirmed she carried a suitcase with cherry blossom stickers.”*

**Audio clue (ElevenLabs):**
Voice of an informant with a French accent:

> *“My friend… yes, she was here. Bought a coffee and stared at her phone. I saw a map with ideograms — not Chinese, more like… Japanese. She ran off when the flight announcement played.”*

**Visual evidence:**
Security-camera image showing a red-clad figure near a terminal displaying **“NRT”** (Narita Airport, Tokyo).

---

### FALSE Path 1 → Polygon / Paris (Stay Put)

**Fake clue in the DeFi protocol:**
A second transaction suggests Carmen is still on Polygon. Logs say:

> *“Second deposit detected in the same pool. Suspect appears to still be operating locally. Have you checked Café des Deux Moulins?”*

**Why it’s false:**
It’s an automated bot Carmen left behind. Deeper inspection shows fixed-interval transactions — not human behavior. Hidden message:

> *“You’re chasing a ghost, detective. She’s already gone.”*

**Trap:**
The café name is real (from the movie *Amélie*), creating a false sense of progress.

---

### FALSE Path 2 → Optimism (London)

**Fake clue in the DeFi protocol:**
A bridge transaction to Optimism appears in the logs with the note:

> *“Funds sent to a staking protocol. Suspect mentioned ‘afternoon tea’ and ‘fog.’ Possible destination: city with a famous river and historic clock.”*

**Why it’s false:**
The clues point to London, but investigating Optimism reveals:

> *“Big Ben is lovely this time of year, but Carmen prefers sushi. Wrong city, detective.”*

**Trap:**
Transaction value is **1.666 ETH** — a reference to the Great Fire of London (1666).

---

## STAGE 3: Arbitrum (Tokyo) → Final Destination

The player is now on Arbitrum investigating an NFT marketplace.

### CORRECT Path → Base (NYC)

**Clue in the NFT marketplace (Arbitrum):**
Carmen listed a fake NFT as a distraction. Metadata contains encoded coordinates:
`40.6892, -74.0445` (Statue of Liberty).

AI-generated clue:

> *“The NFT kiosk vendor said she bought a token with a green crown image. She laughed and said, ‘give me your tired, your poor, your huddled masses.’ Then she asked the price of a transpacific flight west.”*

**Audio clue (ElevenLabs):**
Witness with a Japanese accent:

> *“Hai, I saw her. Western woman, long red coat. She was at the café looking at photos of skyscrapers — not Tokyo ones… different, tighter together. She mentioned ‘the statue that faces west’ and ‘Central Park.’ Then she took a taxi to Narita.”*

**Visual evidence:**
Camera image showing a red-clad figure holding a plane ticket with **“JFK”** partially visible.

---

### FALSE Path 1 → Arbitrum / Tokyo (Stay Put)

**Fake clue in the marketplace:**
A newly listed NFT suggests continued local activity. Metadata says:

> *“New generative art NFT themed ‘Shibuya Crossing at Night.’ Anonymous seller, registered 2 hours ago.”*

**Why it’s false:**
The NFT was minted by an automated contract Carmen set up earlier. Contract history shows all transactions from the same bot address. Hidden message:

> *“She set a trap and you fell for it. Carmen left Tokyo hours ago.”*

**Trap:**
The NFT art looks impressive, tempting the player to over-investigate.

---

### FALSE Path 2 → Polygon (Paris)

**Fake clue in the marketplace:**
A bridge transaction back to Polygon appears in the logs:

> *“Return transfer detected. Suspect may be doubling back to cover tracks. Intercepted fragment: ‘…retour à la maison… finish what I started…’”*

**Why it’s false:**
It’s an automated gas refund. The French fragment is fabricated. Investigation on Polygon reveals:

> *“Déjà vu, detective? Carmen never goes back. She only moves forward.”*

**Trap:**
Players who already visited Paris may think they missed something, creating an investigation loop.

---

## FINAL STAGE: Base (NYC) → Capture

### Capture Scene

The player arrives on Base and finds Carmen in a staking contract. Executing `attemptArrest()`:

> **MISSION COMPLETE!**
>
> Carmen Sandiego has been captured in New York, on the Base network, while attempting to stake the stolen CryptoPunk in a yield-farming protocol.
> CryptoPunk #7804 was recovered and returned to its original Ethereum vault via CCIP.
>
> *“Not bad for a rookie,”* Carmen said as she was escorted away.
> *“See you on the next chain, detective.”*

---

### Failure Scene (Wrong Location)

> **CARMEN ESCAPED!**
>
> You attempted the arrest in the wrong location. While you were investigating, Carmen completed the staking and escaped with the yields.
> The CryptoPunk was moved to a new, unknown chain.
>
> *“Maybe next time, detective,”* a laugh echoed in the next block.

---

## Evidence Summary for the Warrant

| # | Evidence               | Obtained In        | Description                                             |
| - | ---------------------- | ------------------ | ------------------------------------------------------- |
| 1 | **Identity confirmed** | Polygon (Paris)    | Witness confirms “woman in red” + suspicious behavior   |
| 2 | **Escape method**      | Arbitrum (Tokyo)   | Cross-chain bridge + fake NFT distraction               |
| 3 | **Final destination**  | Combined deduction | Coordinates + “statue facing west” + “JFK” = Base (NYC) |

Without all 3 pieces of evidence, `attemptArrest()` automatically fails.

---

## Image Generation Guide

| Scene                   | Image Prompt Description                                                       | Style             |
| ----------------------- | ------------------------------------------------------------------------------ | ----------------- |
| Briefing                | Retro green computer screen with ACME alert text, 90s hacker aesthetic         | Pixel art / retro |
| Ethereum HQ             | Futuristic building with Ethereum logo, open digital vault, red trail exiting  | Cyberpunk         |
| Polygon Paris           | Neon Eiffel Tower with blockchain nodes, red figure on digital bridge          | Neon noir         |
| Polygon Paris – Camera  | Grainy CCTV image, blurred red figure, terminal showing “NRT”                  | CCTV style        |
| Arbitrum Tokyo          | Cyberpunk Shibuya Crossing with NFT holograms, red figure in crowd             | Anime cyberpunk   |
| Arbitrum Tokyo – Camera | CCTV image, figure holding ticket, “JFK” partially visible                     | CCTV style        |
| Base NYC                | Statue of Liberty with digital circuits, NYC skyline made of blocks            | Cyberpunk         |
| Capture                 | Carmen from behind being escorted, CryptoPunk floating above, digital confetti | Retro game style  |
| Failure                 | Computer screen with “CONNECTION LOST”, red shadow fading, broken blocks       | Glitch art        |
| False London Clue       | London Eye with digital glitch, “WRONG CITY” in red text                       | Glitch art        |
| False Tokyo Trap        | Beautiful Shibuya NFT art with hidden “TRAP” watermark                         | Clean → glitch    |
| False Paris Return      | Bridge portal with return arrow, translucent red ghost                         | Ghostly digital   |

---

If you want, I can also:

* Deliver this as a **clean English `script.md` file for download**
* Adapt the language for **game UI vs narrative**
* Simplify for a **pitch deck / hackathon submission**
* Turn this into **JSON/YAML scenario data** for an engine
