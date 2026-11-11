export const initial=()=>({count:0,quiet:0,loud:0});
export function advance(s,level,threshold,dt,pace){
 const n={...s}; dt=Math.max(0,Math.min(dt,1));
 if(level>threshold){n.loud+=dt;n.quiet=Math.max(0,n.quiet-dt);if(n.loud>=2.5){n.count=Math.max(0,n.count-1);n.loud=0;}}
 else if(level<threshold-4){n.loud=0;n.quiet+=dt;if(n.quiet>=pace){n.count=Math.min(12,n.count+1);n.quiet=0;}}
 else n.loud=Math.max(0,n.loud-dt);
 return n;
}

// A separate, one-shot reward clock: brief noise pauses; sustained noise resets.
export function advanceReward(state, level, threshold, dt, goal) {
 if(state.won || !Number.isFinite(goal) || goal<=0 || !Number.isFinite(dt) || dt<=0) return {...state};
 const next={...state};dt=Math.min(dt,1);
 if(level>threshold){next.loud+=dt;if(next.loud>=2.5)next.elapsed=0;}
 else {next.loud=0;if(level<threshold-4)next.elapsed=Math.min(goal,next.elapsed+dt);}
 next.won=next.elapsed>=goal;return next;
}
