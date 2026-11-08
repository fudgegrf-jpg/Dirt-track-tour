import * as THREE from 'three';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
// A bounded 4-tap depth-aware contact AO, subtle film grade and vignette.
// High only: Low/Medium never execute this pass or the bloom composer.
export class GraphicsFinishPass extends ShaderPass{
 constructor(){super({uniforms:{tDiffuse:{value:null},tDepth:{value:null},resolution:{value:new THREE.Vector2(1,1)},nearFar:{value:new THREE.Vector2(.1,6000)}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`uniform sampler2D tDiffuse,tDepth;uniform vec2 resolution,nearFar;varying vec2 vUv;
 float linearDepth(float z){float n=nearFar.x,f=nearFar.y;return 2.*n*f/(f+n-(z*2.-1.)*(f-n));}
 void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;float raw=texture2D(tDepth,vUv).x,d=linearDepth(raw),occ=0.;vec3 glow=vec3(0.);vec2 radius=vec2(clamp(250./max(d,1.),2.,10.))/resolution;
 for(int i=0;i<4;i++){float a=float(i)*1.570796;vec2 tap=clamp(vUv+vec2(cos(a),sin(a))*radius,vec2(.001),vec2(.999));float nd=linearDepth(texture2D(tDepth,tap).x);glow+=max(texture2D(tDiffuse,tap).rgb-vec3(3.),vec3(0.));float diff=d-nd;occ+=smoothstep(.035,.18,diff)*(1.-smoothstep(.25,2.2,diff));}
 float ao=raw<.99999?1.-occ*.05:1.;vec2 q=vUv*(1.-vUv.yx);float vig=mix(.91,1.,smoothstep(0.,.16,q.x*q.y*16.));c=(c+glow*.006)*ao*vig;float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,1.035);c*=vec3(1.015,1.,.985);gl_FragColor=vec4(max(c,vec3(0.)),1.);}`});this.material.toneMapped=false;}
 render(renderer,writeBuffer,readBuffer,dt,mask){this.uniforms.tDepth.value=readBuffer.depthTexture;super.render(renderer,writeBuffer,readBuffer,dt,mask);}
}
