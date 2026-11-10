export const initial=()=>({count:0,quiet:0,loud:0});
export function advance(s,level,threshold,dt,pace){
 const n={...s}; dt=Math.max(0,Math.min(dt,1));
 if(level>threshold){n.loud+=dt;n.quiet=Math.max(0,n.quiet-dt);if(n.loud>=2.5){n.count=Math.max(0,n.count-1);n.loud=0;}}
 else if(level<threshold-4){n.loud=0;n.quiet+=dt;if(n.quiet>=pace){n.count=Math.min(12,n.count+1);n.quiet=0;}}
 else n.loud=Math.max(0,n.loud-dt);
 return n;
}
