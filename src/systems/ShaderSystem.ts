import { EntityUUID } from "@etherealengine/common/src/interfaces/EntityUUID";
import { Engine } from "@etherealengine/engine/src/ecs/classes/Engine";
import { SceneState } from "@etherealengine/engine/src/ecs/classes/Scene";
import { getComponent, setComponent } from "@etherealengine/engine/src/ecs/functions/ComponentFunctions";
import { createEntity } from "@etherealengine/engine/src/ecs/functions/EntityFunctions";
import { EntityTreeComponent } from "@etherealengine/engine/src/ecs/functions/EntityTree";
import { defineSystem } from "@etherealengine/engine/src/ecs/functions/SystemFunctions";
import { VisibleComponent } from "@etherealengine/engine/src/scene/components/VisibleComponent";
import { getState } from "@etherealengine/hyperflux";

import { useEffect } from 'react'
import { MathUtils, Mesh, PlaneGeometry, ShaderMaterial, Uniform, Vector2, Vector3 } from "three";

import { createNewEditorNode } from "@etherealengine/engine/src/scene/systems/SceneLoadingSystem"
import LogarithmicDepthBufferMaterialChunk from '@etherealengine/engine/src/scene/functions/LogarithmicDepthBufferMaterialChunk'
import { addObjectToGroup } from "@etherealengine/engine/src/scene/components/GroupComponent";
import { LocalTransformComponent, TransformComponent } from "@etherealengine/engine/src/transform/components/TransformComponent";
import { Entity } from "@etherealengine/engine/src/ecs/classes/Entity";
import { EngineState } from "@etherealengine/engine/src/ecs/classes/EngineState";

let shader: ShaderMaterial | null = null
let screenEntity: Entity = -1 as Entity
export default defineSystem({
  uuid: 'ShaderSystem',
  reactor: () => {    
    useEffect(() => {
      screenEntity = createEntity()
      createNewEditorNode(
        screenEntity,
        [{
          name: "Shader Screen"
        }],
        getState(SceneState).sceneEntity
      )
      shader = new ShaderMaterial({
        vertexShader: `
#ifdef USE_FOG
  varying float vFogDepth;
#endif
varying vec2 vUv;
#include <logdepthbuf_pars_vertex>
${LogarithmicDepthBufferMaterialChunk}
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  #include <logdepthbuf_vertex>
  #ifdef USE_FOG
    vFogDepth = (modelViewMatrix * vec4(position, 1.0)).z;
  #endif
}`,
      fragmentShader: `
  precision mediump float;
  uniform vec3 cameraPos;
  uniform float uTime;
  varying vec2 vUv;
  #include <logdepthbuf_pars_fragment>

  #define MAX_STEPS 100
  #define MIN_DIST 0.001
  #define MAX_DIST 1000.0

  vec3 torus(vec3 p, vec2 t) {
    float angle = uTime;
    float c = cos(angle);
    float s = sin(angle);
    mat3 rotationMatrix = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
    p = rotationMatrix * p;

    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return vec3(length(q) - t.y, q.y, 0.0);
  }

  float shortestDistanceToTorus(vec3 ro, vec2 t) {
    return torus(ro, t).x;
  }

  vec3 rayMarch(vec3 ro, vec3 rd) {
    float d = 0.0;
    for (int i = 0; i < MAX_STEPS && d < MAX_DIST; i++) {
      vec3 p = ro + rd * d;
      float dist = shortestDistanceToTorus(p, vec2(0.5, 0.2));
      if (dist < MIN_DIST) {
        float cameraDist = length(p - cameraPos);
        float shade = smoothstep(0.0, 5.0, cameraDist);
        return vec3(shade, 0.0, 0.0);
      }
      d += dist;
    }
    return vec3(0.0);
  }

  void main() {
    vec2 uv = vUv;
    vec3 viewDir = normalize(vec3(uv - 0.5, 1.0));
    vec3 color = rayMarch(cameraPos, viewDir);
    gl_FragColor = vec4(color, 1.0);
    //gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    #include <logdepthbuf_fragment>
  }      
`,
        uniforms: {
          cameraPos: new Uniform(new Vector3(0, 0, 0)),
          uTime: new Uniform(0)
        }
      })
      const screenMesh = new Mesh(
        new PlaneGeometry(4, 4),
        shader
      )
      addObjectToGroup(screenEntity, screenMesh)
      getComponent(screenEntity, LocalTransformComponent).position.add(
        new Vector3(0, 3, -3)
      )
    }, [])

    return null
  },
  execute: () => {
    if(screenEntity === -1) return
    if(!Engine.instance.localClientEntity) return
    if(shader === null) return
    const clientTransform = getComponent(Engine.instance.localClientEntity, TransformComponent)
    const screenTransform = getComponent(screenEntity, TransformComponent)
    const relativePos = screenTransform.position.clone().sub(clientTransform.position)
    relativePos.y = 0
    shader.uniforms['cameraPos'].value = relativePos;
    shader.uniforms['uTime'].value = getState(EngineState).elapsedSeconds
  }
})