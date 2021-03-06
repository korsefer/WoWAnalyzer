import React from 'react';

import SPELLS from 'common/SPELLS';
import SpellIcon from 'common/SpellIcon';
import Combatants from 'parser/shared/modules/Combatants';
import StatTracker from 'parser/shared/modules/StatTracker';
import Analyzer from 'parser/core/Analyzer';
import StatisticBox, { STATISTIC_ORDER } from 'interface/others/StatisticBox';
import { formatNumber, formatPercentage } from 'common/format';
import calculateEffectiveHealing from 'parser/core/calculateEffectiveHealing';
import PRIEST_SPELLS from 'common/SPELLS/priest';
import PRIEST_TALENTS from 'common/SPELLS/talents/priest';

import isAtonement from '../core/isAtonement';

// Use the priest spell list to whitelist abilities
const PRIEST_WHITELIST = Object.entries({
  ...PRIEST_SPELLS,
  ...PRIEST_TALENTS,
}).map(ability => ability[1].id);

class grace extends Analyzer {
  static dependencies = {
    combatants: Combatants,
    statTracker: StatTracker,
  };

  applyAbsorbEvents = [];

  graceHealing = 0;
  graceHealingToAtonement = 0;

  healingUnaffectedByMastery = 0;
  healingUnbuffedByMastery = 0;
  healingBuffedByMastery = 0;
  atonement = 0;

  getGraceHealing(event) {
    const currentMastery = this.statTracker.currentMasteryPercentage;
    const masteryContribution = calculateEffectiveHealing(
      event,
      currentMastery,
    );
    return masteryContribution;
  }

  on_byPlayer_absorbed(event){
    const spellId = event.ability.guid;

    if(!PRIEST_WHITELIST.includes(spellId)){
      this.healingUnaffectedByMastery += event.amount;
      return;
    }

    const target = this.combatants.getEntity(event);
    if (!target) return;

    if(this.absorbApplicationWasMasteryBuffed(event)){
      this.graceHealing += this.getGraceHealing(event);
      this.healingBuffedByMastery += event.amount;
    } else {
      this.healingUnbuffedByMastery += event.amount;
    }
  }

  absorbApplicationWasMasteryBuffed(event){
    const findRight = (arr, fn) => [...arr].reverse().find(fn);
    const applyEvent = findRight(this.applyAbsorbEvents,
      x => x.applyBuffEvent.targetID === event.targetID && x.applyBuffEvent.ability.guid === event.ability.guid);
    return applyEvent ? applyEvent.masteryBuffed : false;
  }

  on_byPlayer_applybuff(event) {
    const spellId = event.ability.guid;

    if(!(PRIEST_WHITELIST.includes(spellId) && event.absorb)){
      return;
    }

    const target = this.combatants.getEntity(event);
    if (!target) return;

    this.applyAbsorbEvents.push({
      applyBuffEvent: event,
      masteryBuffed: target.hasBuff(SPELLS.ATONEMENT_BUFF.id),
      eventsAssociated: [],
    });

  }

  on_byPlayer_heal(event) {
    const spellId = event.ability.guid;

    if (!PRIEST_WHITELIST.includes(spellId)) {
      this.healingUnaffectedByMastery += event.amount;
      return;
    }

    const target = this.combatants.getEntity(event);
    if (!target) return;

    if (!target.hasBuff(SPELLS.ATONEMENT_BUFF.id)) {
      this.healingUnbuffedByMastery += event.amount;
      return;
    }

    if(isAtonement(event)) {
      this.atonement += event.amount;
      this.graceHealingToAtonement += this.getGraceHealing(event);
    }
    this.healingBuffedByMastery += event.amount;
    this.graceHealing += this.getGraceHealing(event);
  }

  statistic() {
    const graceHealingPerc = this.owner.getPercentageOfTotalHealingDone(this.graceHealing);
    const healingUnaffectedByMasteryPerc = this.owner.getPercentageOfTotalHealingDone(this.healingUnaffectedByMastery);
    const healingUnbuffedByMasteryPerc = this.owner.getPercentageOfTotalHealingDone(this.healingUnbuffedByMastery);
    const healingBuffedByMasteryPerc = this.owner.getPercentageOfTotalHealingDone(this.healingBuffedByMastery - this.graceHealing);
    const atonementPerc = this.owner.getPercentageOfTotalHealingDone(this.atonement - this.graceHealingToAtonement);
    const nonAtonementPerc = this.owner.getPercentageOfTotalHealingDone((this.healingBuffedByMastery - this.graceHealing) - (this.atonement - this.graceHealingToAtonement));

    return (
      <StatisticBox
        icon={<SpellIcon id={SPELLS.GRACE.id} />}
        value={`${formatNumber(
          this.graceHealing / this.owner.fightDuration * 1000,
        )} HPS`}
        label="Mastery Healing"
        tooltip={(
          <>
            Your mastery provided <strong>{formatPercentage(graceHealingPerc)}%</strong> healing
            <ul>
              <li><strong>{formatPercentage(healingBuffedByMasteryPerc)}%</strong> of your healing was buffed by mastery
                <ul>
                  <li>Atonement: <strong>{formatPercentage(atonementPerc)}%</strong></li>
                  <li>Non-Atonement: <strong>{formatPercentage(nonAtonementPerc)}%</strong></li>
                </ul>
              </li>
              <li><strong>{formatPercentage(healingUnbuffedByMasteryPerc)}%</strong> of your healing was spells unbuffed by mastery</li>
              <li><strong>{formatPercentage(healingUnaffectedByMasteryPerc)}%</strong> of your healing was spells unaffected by mastery </li>
            </ul>
            <br />
            <strong>Unbuffed</strong> healing is healing done to targets without atonement with spells that can benefit from mastery. <br />
            <strong>Unaffected</strong> healing is healing done with spells that can't benefit from mastery (Trinkets, procs, etc...)
          </>
        )}
      />
    );
  }
  statisticOrder = STATISTIC_ORDER.CORE(3);
}

export default grace;
