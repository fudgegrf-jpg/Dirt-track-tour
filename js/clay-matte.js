import * as THREE from 'three';
// Clay stays a dusty dielectric even when a scan's green roughness channel is dark.
// Keep headlights, car paint and emissive lamps outside this material-specific limit.
export function matteClayShader(shader){
 shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(0.965+roughnessFactor*0.025,0.965,1.0);')
 .replace('#include <opaque_fragment>','outgoingLight*=min(1.0,0.78/max(0.0001,max(outgoingLight.r,max(outgoingLight.g,outgoingLight.b))));\n#include <opaque_fragment>');
}
export function matteClay(options={}){const material=new THREE.MeshPhysicalMaterial({...options,roughness:1,metalness:0,specularIntensity:0,clearcoat:0,envMapIntensity:0});material.onBeforeCompile=matteClayShader;material.customProgramCacheKey=()=> 'dusty-clay-v1';material.userData.clayMatte={minRoughness:.965,specularIntensity:0,envMapIntensity:0,radianceCeiling:.78};return material;}
