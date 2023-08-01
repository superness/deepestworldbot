// Skill and damage calcuation
function getBestSkill(targetDistance) {
    let bestSkill = null
    let mostDamage = 0
    for (let skill of dw.c.skills) {
        if (skill.range < targetDistance) {
            continue
        }
        let skillDamage = getSkillDamage(skill)
        if (mostDamage < skillDamage) {
            mostDamage = skillDamage
            bestSkill = skill
        }
    }
    return bestSkill
}

function getSkillDamage(skill) {
    if (!skill)
        return 0
    let skillDmg = skill.acidDmg + skill.coldDmg + skill.fireDmg + skill.elecDmg + skill.physDmg
    return skillDmg ?? 0
}

let eleNameTypes = ["fire", "elec", "cold", "acid"]
let eleNameTypesRegex = new RegExp(eleNameTypes.join("|"), "i")

function getMonsterBattleScore(monster, useFullHp = false) {
    // Without a better damage calculation method let's give elemental monsters a scarier battle score
    // assuming we are going to be weaker against ele dmg than phys
    let isEle = eleNameTypesRegex.test(monster.md) || monster.terrain != 1
    return (useFullHp ? monster.hpMax : monster.hp) * getMonsterDmg(monster) * (isEle ? 1.3 : 1)
}

function getMonsterDmg(monster) {
    let dmg = 19 * Math.pow(monster.hpMax / 95, 0.5)
    if (monster.r ?? 0 > 1) {
        dmg += 1 + monster.r * 0.5
    }
    return dmg
}

function getMyDmg() {
    let mySkillInfo = getBestSkill(0) ?? dw.c.skills.filter((s) => s.md).shift()
    return getSkillDamage(mySkillInfo)
}

function getMaxDamageDealtBeforeOom() {
    let target = dw.findEntities((entity) => entity.id === dw.targetId).shift()

    if (!target) return Number.MAX_SAFE_INTEGER

    let myBestSkill = getBestSkill(dw.distance(target, dw.c))
    let mySkillInfo = myBestSkill ?? dw.c.skills.filter((s) => s.md).shift()

    if (dw.c.mpRegen > mySkillInfo.cost) return Number.MAX_SAFE_INTEGER

    if(dw.c.mp < mySkillInfo.cost) return 0

    let timeToOom = dw.c.mp / (mySkillInfo.cost - dw.c.mpRegen)
    let myDmg = getMyDmg()

    let maxPossibleDmg = timeToOom * myDmg
    return maxPossibleDmg
}

function getMyBattleScore(useMaxHp = false) {
    let hpScorePart = (useMaxHp ? dw.c.hpMax : dw.c.hp)

    let potentialScore = getMyDmg() * hpScorePart
    let maxTargetLife = getMaxDamageDealtBeforeOom()
    let maxDmgScore = maxTargetLife * getMyDmg()
    let dmgScorePart = Math.min(maxDmgScore, potentialScore)
    let battleScore = dmgScorePart

    return battleScore
}

function getMyMaximumBattleScore() {
    let potentialScore = (getMyDmg() * dw.c.hpMax)

    return potentialScore
}

// Analytics
class DWAnalytics {
    constructor(character, apiBaseUrl, dw) {
        this.character = character
        this.apiBaseUrl = apiBaseUrl

        this.initialize(dw)
    }

    combatLog = []

    pruneCombatLog() {
        // Trim out old combat events
        let now = new Date()
        this.combatLog =  this.combatLog.filter(e => (now - e.when) < 5000)
    }

    initialize(dw) {
        this.prevLevel = dw.c.level
        this.dw = dw

        setInterval(() => this.levelUpCheck(), 1000)
        setInterval(() => this.pruneCombatLog(), 1000)

        dw.on('loot', d => {
            for (let e of d) {
                this.onLoot(e.item.md, e.item.qual, e.item.r ?? 0, JSON.stringify(e.item.mods))
            }
        })

        dw.on("hit", (data) => {
            for (let hit of data) {
                if (!hit.amount)
                    continue;
                this.processHitEventAnalytics(hit)
            }
        })
    }

    levelUpCheck() {
        if (this.dw.c.level > this.prevLevel) {
            this.onLevel(dw.c.level, "woot")
            this.prevLevel = this.dw.c.level
            this.dw = dw
        }
    }

    publishAndFlushCombatLog() {
        for(let combatEvent of this.combatLog) {
            dwa.onCombatLogEvent(combatEvent.characterId, combatEvent.monsterName, combatEvent.damage, combatEvent.description, combatEvent.isCharacterHit, combatEvent.skillUsed, encodeURIComponent(combatEvent.when.toISOString()))
        }

        this.combatLog = []
    }

    processHitEventAnalytics(hit) {
        console.log('a hit', hit)
        let target = dw.findEntities((entity) => entity.id === hit.target).shift()
        let actor = dw.findEntities((entity) => entity.id === hit.actor).shift()
        if (!hit.amount) {
            return
        }

        // Log the combat event for hitting the character or the character hitting something
        if(hit.target == this.dw.c.id || hit.actor == this.dw.c.id) {
            let isCharacterHit = hit.actor == this.dw.c.id

            let monster = isCharacterHit ? target : actor

            let hitSource = isCharacterHit ? this.dw.c : monster
            let hitDest = isCharacterHit ? monster : this.dw.c

            this.combatLog.push({
                characterId:this.getDBId(),
                monsterName:monster.md,
                damage:hit.amount,
                description:`lvl ${hitSource.level} ${hitSource.md} [${hitSource.hp}/${hitSource.hpMax}] attacking lvl ${hitDest.level} ${hitDest.md} [${hitDest.hp}/${hitDest.hpMax}] for ${hit.amount} with ${hit.md ?? 'attack'}`,
                isCharacterHit:isCharacterHit,
                skillUsed:(hit.md ?? "attack"),
                when:new Date()
            })
        }

        if(hit.rip) {
            this.publishAndFlushCombatLog()
        }

        if (hit.rip && hit.target == dw.c.id) {

            let monsterBattleScore = Math.trunc(getMonsterBattleScore(target, true))
            let myBattleScore = Math.trunc(getMyMaximumBattleScore())

            let deathDescription = `${myBattleScore} vs ${monsterBattleScore}`

            let monstersTargettingMe = dw.findEntities(e => e.targetId && e.targetId == this.dw.c.id)

            let monstersTargettingMeDescInfo = monstersTargettingMe.map(e => ({name: e.name ?? e.md, level: e.level, r: e.r, hp: e.hp }))
            if(monstersTargettingMeDescInfo.length > 0) {
                deathDescription += ` - ${JSON.stringify(monstersTargettingMeDescInfo)}`
            }

            dwa.onDeath(actor.md, actor.level, actor.hpMax, deathDescription)
            moveToSpot = dw.c.spawn;
            this.dw.setTarget(null)

        } else if (hit.rip && hit.actor == this.dw.c.id) {
            let myBattleScore = Math.trunc(getMyMaximumBattleScore())

            let monsterBattleScore = Math.trunc(getMonsterBattleScore(target, true))
            dwa.onKill(target.md, target.level ?? 0, target.r ?? 0, `${myBattleScore} vs ${monsterBattleScore}`)
        }
    }

    getDBIdKey() {
        return `${this.character.name}_${this.character.charDbId}_DWAnalyticsID`
    }

    getDBId() {
        // In the darkest corners of memory (localStorage), our past is waiting.
        return this.dw.get(this.getDBIdKey());
    }

    setDBId(id) {
        this.dw.set(this.getDBIdKey(), id)
    }

    async onStart() {
        console.log("🌄  A new dawn breaks. With hope in our hearts, we stand once more.");
        try {
            // Check if we exist in the db yet
            let url = `${this.apiBaseUrl}/Characters/ByDWId/${this.getDBIdKey()}`;
            let data = await this.getJson(url);
            console.log('got this character', data)

            this.setDBId(data.id)
        }
        // It's probably 404 (not found) so make it
        catch (ex) {
            console.log("🌱  From the Ashes of the past, new life emerges. We define our existence anew.");
            let url = `${this.apiBaseUrl}/Characters?name=${this.character.name}&level=${this.character.level}&dwId=${this.getDBIdKey()}&description=somebot`;
            let data = await this.postJson(url);
            this.setDBId(data.id)
            console.log("🔮  A new thread weaves into the tapestry of time. Our journey is remembered.");
        }

        dw.log(`you can watch your character here https://deepestworldex.com/Character?id=${this.getDBId()}`)
        console.log('you can watch your character here', `https://deepestworldex.com/Character?id=${this.getDBId()}`)

    }

    async onCombatLogEvent(characterId, monsterName, damage, description, isCharacterHit, skillUsed, when) {
        console.log("💥 Combat Log Event");
        const url = `${this.apiBaseUrl}/CombatLog?characterId=${characterId}&monsterName=${monsterName}&damage=${damage}&description=${description}&isCharacterHit=${isCharacterHit}&skillUsed=${skillUsed}&when=${when}`;
        const data = await this.postJson(url);
        console.log("📜 Logged combat event.");
        return data;
    }

    async onDeath(nameOfMurderer, levelOfMurderer, maxHPOfMurderer, description = "death") {
        console.log("💔  The weight of loss is heavy. Yet we endure, carrying their memory within us.");
        const url = `${this.apiBaseUrl}/CharacterDeaths?characterId=${this.getDBId()}&murderer=${nameOfMurderer}&level=${levelOfMurderer}&maxHP=${maxHPOfMurderer}&description=${description}`;
        const data = await this.postJson(url);
        console.log("⌛  The Sands of Time hold our sorrows. Our fallen friend, remembered.");
        return data;
    }

    async onLevel(level, description = "level") {
        console.log("💖  Healing is not linear. With each step, we grow stronger, not forgetting, but carrying on.");
        const url = `${this.apiBaseUrl}/CharacterLevelUps?characterId=${this.getDBId()}&level=${level}&description=${description}`;
        const data = await this.postJson(url);
        console.log("🌈  Progress may be invisible, but it is real. We honor our journey, marking each step.");
        return data;
    }

    async onKill(monsterName, monsterLevel, monsterRank, description = "kill") {
        console.log("⚔️  We meet adversity with courage. Each victory, a testament to our resilience.");
        const url = `${this.apiBaseUrl}/MonsterKills?characterId=${this.getDBId()}&monsterName=${monsterName}&monsterLevel=${monsterLevel}&monsterRank=${monsterRank}&description=${description}`;
        const data = await this.postJson(url);
        console.log("🏆  We carve our path through the echoes of the past. Each challenge, a stepping stone.");
        return data;
    }

    async onLoot(itemType, itemLevel, itemRarity, description = "loot") {
        const url = `${this.apiBaseUrl}/CharacterLootEvents?characterId=${this.getDBId()}&itemType=${itemType}&itemLevel=${itemLevel}&itemRarity=${itemRarity}&description=${description}`;
        const data = await this.postJson(url);
        return data
    }

    async divineIntervention(method, url, data = null) {
        console.log('divine inter postal', method, url, data)
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: data ? JSON.stringify(data) : null
        });

        if (!response.ok) {
            throw new Error(`🌩️  Oh no, we summoned an HTTP error! status: ${response.status}`);
        }

        return await response.json();
    }

    postJson(url, data) {
        return this.divineIntervention('POST', url, data);
    }
    getJson(url) {
        return this.divineIntervention('GET', url);
    }
}


const dwa = new DWAnalytics(dw.c, "https://deepestworldex.com/api", dw)

dwa.onStart()
