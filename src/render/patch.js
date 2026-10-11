// Tiny helper to splice custom GLSL into three's built-in materials while
// keeping their lighting, shadows and fog.
export function patchShader(material, opts) {
  const {
    key,
    uniforms = {},
    vertexHeader = '',
    fragmentHeader = '',
    vertex = {},
    fragment = {},
  } = opts;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = vertexHeader + '\n' + shader.vertexShader;
    shader.fragmentShader = fragmentHeader + '\n' + shader.fragmentShader;
    for (const [chunk, code] of Object.entries(vertex)) {
      shader.vertexShader = shader.vertexShader.replace(`#include <${chunk}>`, code);
    }
    for (const [chunk, code] of Object.entries(fragment)) {
      shader.fragmentShader = shader.fragmentShader.replace(`#include <${chunk}>`, code);
    }
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => key;
  return material;
}
