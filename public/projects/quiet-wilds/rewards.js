import {advanceReward} from './engine.js';
const $=id=>document.getElementById(id);
const fresh=()=>({elapsed:0,loud:0,won:false});
const clock=s=>`${Math.floor(Math.ceil(s)/60)}:${String(Math.ceil(s)%60).padStart(2,'0')}`;
export function createRewards({getMode,stopListening,inviteFriends}) {
 let state=fresh(),armed=false,goal=300,reward='',demo=false,partyTimer=null,lastStatus='';
 function announce(text){if(text!==lastStatus){$('rewardStatus').textContent=text;lastStatus=text;}}
 function finishParty(){clearTimeout(partyTimer);document.body.classList.remove('celebrating');$('confetti').replaceChildren();}
 function clear(){finishParty();state=fresh();armed=false;demo=false;$('rewardBanner').hidden=true;render();}
 function interrupt(){if(!state.won){state=fresh();}finishParty();render();}
 function render(){
  $('rewardMinutes').disabled=armed&&!state.won;$('rewardText').disabled=armed&&!state.won;
  document.querySelectorAll('[data-reward]').forEach(b=>b.disabled=armed&&!state.won);
  $('armReward').textContent=state.won?'Start a new goal':armed?'Restart goal':'Set quiet goal';
  $('cancelReward').hidden=!armed;
  $('rewardProgress').value=armed?Math.min(100,state.elapsed/goal*100):0;
  $('rewardTime').textContent=armed?`${clock(state.elapsed)} / ${clock(goal)}`:'No goal running';
  $('goalChip').hidden=!armed;
  $('goalChip').textContent=state.won?(demo?'Demo goal complete ✨':'Reward unlocked ✨'):`${demo?'Demo · ':''}Quiet goal ${clock(state.elapsed)} / ${clock(goal)}`;
  $('scene').classList.toggle('reward-won',!$('rewardBanner').hidden);
  if(state.won)announce(demo?'Demo complete. No classroom reward was earned.':'Goal reached! Listening has stopped. Enjoy your reward together.');
  else if(armed)announce(getMode()==='off'?'Goal ready. Start listening, or try a demo. Interruptions restart the quiet streak.':state.loud>=2.5?'A fresh start. The quiet streak has reset.':state.loud>0?'A little lively. The quiet timer is paused.':`Working toward: ${reward}`);
  else announce('Choose a quiet goal and a reward, then set the goal.');
 }
 function celebrate(){
  demo=getMode()==='demo';
  stopListening('Goal complete. Microphone off so everyone can celebrate.');
  inviteFriends();
  $('rewardHeading').textContent=demo?'Demo celebration!':'You did it, explorers!';
  $('earnedReward').textContent=reward;
  $('rewardCaption').textContent=demo?'Preview only · no classroom reward earned':`${clock(goal)} of quiet teamwork. Your reward is unlocked!`;
  $('rewardBanner').hidden=false;
  document.body.classList.add('celebrating');
  const colors=['#e6ad45','#e58691','#77a66b','#75b9c9','#b19bd0'];
  for(let i=0;i<60;i++){const bit=document.createElement('i');bit.style.setProperty('--x',`${Math.random()*100}%`);bit.style.setProperty('--turn',`${Math.random()*600-300}deg`);bit.style.setProperty('--wait',`${Math.random()*.7}s`);bit.style.background=colors[i%colors.length];$('confetti').append(bit);}
  partyTimer=setTimeout(finishParty,7000);render();
 }
 function tick(level,threshold,dt){if(!armed||state.won||getMode()==='off')return;demo=getMode()==='demo';const wasWon=state.won;state=advanceReward(state,level,threshold,dt,goal);if(!wasWon&&state.won)celebrate();else render();}
 $('armReward').onclick=()=>{
  const minutes=Number($('rewardMinutes').value);
  if(!$('rewardMinutes').value.trim()||!Number.isFinite(minutes)||minutes<.1||minutes>120){announce('Choose a quiet goal from 0.1 to 120 minutes.');$('rewardMinutes').focus();return;}
  const text=$('rewardText').value.trim();if(!text){announce('Type a reward or choose an idea first.');$('rewardText').focus();return;}
  clear();goal=Math.round(minutes*60);reward=text.slice(0,160);armed=true;demo=getMode()==='demo';render();
 };
 $('cancelReward').onclick=()=>{clear();$('armReward').focus();};
 $('dismissReward').onclick=()=>{finishParty();$('rewardBanner').hidden=true;render();$('armReward').focus();};
 document.querySelectorAll('[data-reward]').forEach(b=>b.onclick=()=>{$('rewardText').value=b.dataset.reward;});
 return {tick,render,interrupt,clear};
}
