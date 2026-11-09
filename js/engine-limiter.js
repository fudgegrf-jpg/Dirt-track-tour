// Six selected firing events per two V8 cycles; never mute the whole engine.
// Shared by native-rate sample playback and the existing synth mix gain.
export const CUT_DEPTH=.58;
export const CUT_MASK=0b0101001010010100;
export function cylinderCutGain(firingPhase,amount=1){
 if(amount<=0)return 1;
 const fire=Math.floor(firingPhase);
 if(!((CUT_MASK>>>(fire&15))&1))return 1;
 const u=firingPhase-fire,shape=16*u*u*(1-u)*(1-u);
 return 1-CUT_DEPTH*amount*shape; // floor .42 (−7.54 dB), smooth at every join
}
