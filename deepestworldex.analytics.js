function getSkillDamage(skill) {
    if (!skill)
        return 0;
    return skill.acidDmg + skill.coldDmg + skill.fireDmg + skill.elecDmg + skill.physDmg;
}
function getBestSkill(targetDistance) {
    let bestSkill = dw.c.skills.filter((s) => s).shift();
    let mostDamage = getSkillDamage(bestSkill);
    for (let skill of dw.c.skills) {
        if (skill.range > targetDistance) {
            continue;
        }
        let skillDamage = getSkillDamage(skill);
        if (mostDamage < skillDamage) {
            mostDamage = skillDamage;
            bestSkill = skill;
        }
    }
    return bestSkill;
}
function getMyDmg() {
    let mySkillInfo = getBestSkill(99) ?? dw.c.skills.filter((s) => s.md).shift();
    return getSkillDamage(mySkillInfo);
}
function getMonsterDmg(monster) {
    let dmg = 19 * Math.pow(monster.hpMax / 95, 0.5);
    if (monster.r ?? 0 > 1) {
        dmg += 1 + monster.r * 0.5;
    }
    return dmg;
}
function getMyMaximumBattleScore() {
    let potentialScore = (getMyDmg() * dw.c.hpMax) + 1200;
    let bestSkill = getBestSkill(6);
    return potentialScore + ((bestSkill.range ?? 0) * dw.c.hpMax);
}


var eleNameTypes = ["fire", "elec", "cold", "acid"];
var eleNameTypesRegex = new RegExp(eleNameTypes.join("|"), "i");
function getMonsterBattleScore(monster, useFullHp = false) {
    let isEle = eleNameTypesRegex.test(monster.md) || monster.terrain != 1;
    return (useFullHp ? monster.hpMax : monster.hp) * getMonsterDmg(monster) * (isEle ? 1.3 : 1);
}





// Analytics
class DWAnalytics {
    constructor(character, apiBaseUrl, dw) {
        this.character = character
        this.apiBaseUrl = apiBaseUrl

        this.initialize(dw)
    }

    prevLevel = dw.c.level
    dw = dw

    initialize(dw) {
        setInterval(function () {
            if (this.dw.c.level > this.prevLevel) {
                console.log('level!')
                this.onLevel(dw.c.level, "woot")
                this.prevLevel = this.dw.c.level
                this.dw = dw
            }
        }, 1000)


        dw.on('loot', d => {
            for (let e of d) {
                this.onLoot(e.item.md, e.item.qual, e.item.r ?? 0, JSON.stringify(e.item.mods))
            }
        })

        dw.on("hit", (data) => {
            console.log('hit!')
            for (let hit of data) {
                if (!hit.amount)
                    continue;
                this.processHitEventAnalytics(hit)
            }
        })
    }

    processHitEventAnalytics(hit) {
        let target = dw.findEntities((entity) => entity.id === hit.target).shift()
        let actor = dw.findEntities((entity) => entity.id === hit.actor).shift()
        if (!hit.amount) {
            return
        }
        if (hit.rip && hit.target == dw.c.id) {
            
        let monsterBattleScore = Math.trunc(getMonsterBattleScore(target, true))
            
        let myBattleScore = Math.trunc(getMyMaximumBattleScore())
            
            dwa.onDeath(actor.md, actor.level, actor.hpMax, `${myBattleScore} vs ${monsterBattleScore}`)
            moveToSpot = dw.c.spawn;
            this.dw.setTarget(null);
            
        } else if (hit.rip && hit.actor == this.dw.c.id) {
            let myBattleScore = Math.trunc(getMyMaximumBattleScore())
            
            let monsterBattleScore = Math.trunc(getMonsterBattleScore(target, true))
            dwa.onKill(target.md, target.level, target.r ?? 0, `${myBattleScore} vs ${monsterBattleScore}`)
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
        console.log('set id to ', id)
        this.dw.set(this.getDBIdKey(), id)
        console.log('id set')
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


const dwa = new DWAnalytics(dw.c, "https://www.deepestworldex.com/api", dw)

dwa.onStart()
