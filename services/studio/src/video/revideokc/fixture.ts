/**
 * The revideokc doctor's fixture (phase 2c of docs/STUDIO-VIDEO-TOOLS.md): a
 * small topic that uses what this tool exists for, a three.js stage with a
 * spotlight, shadows and a glass card, a 2D title over it, a spring and a cue
 * on a spoken word, so a doctor that renders it proves the parts a real job
 * needs: WebGL inside the profile, both workers' ports, narration in the
 * narration profile, and the sidecars after the build.
 *
 * It is also the manual's worked scene (`manual.ts`), the way manimkc's
 * manual carries two worked scenes the suite renders: the agent learns from
 * code this machine has rendered inside the same profile its own will.
 */

/** Two short chapters, about fifteen seconds voiced: enough for two workers to split. */
export const FIXTURE_NARRATION = [
  {
    scene: "DF1_Stage",
    title: "A stage in depth",
    lines: ["A card stands on a lit stage, and a spotlight follows it."],
  },
  {
    scene: "DF2_Light",
    title: "Light and shadow",
    lines: ["The card turns, and its shadow turns with it on the floor."],
  },
] as const;

export const FIXTURE_TOPIC_YML = `title: "Doctor fixture"
topic: doctor-fixture
concepts: []
tags: []
prerequisites: []
materials: []
prefix: DF
narrated:
  scene: scene.tsx
  output: doctor_fixture.mp4
`;

/** The worked scene: a three.js card under a spotlight, a 2D title, a spring and a word cue. */
export const FIXTURE_SCENE = `/** @jsxImportSource @revideo/2d/lib */
// The doctor's fixture and the manual's worked scene: a glass card on a lit
// three.js stage, a 2D title drawn over it, a spring, and a cue on a word.
import {Txt} from '@revideo/2d';
import {PlopSpring, all, createRef, easeInOutCubic, spawn, spring, tween} from '@revideo/core';
import * as THREE from 'three';
import {Three, defineTopic} from '#lib';

const SANS = 'Helvetica Neue, Helvetica, Arial, sans-serif';
const INK = '#E9EDF5';
const ACCENT = '#F5C542';

/** A card: a plane with a canvas texture, lit by the scene and lit by itself, so its text reads in shadow. */
function card(label: string): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const g = canvas.getContext('2d')!;
  g.fillStyle = 'rgba(20,24,32,0.9)';
  g.beginPath();
  g.roundRect(8, 8, 496, 304, 28);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = ACCENT;
  g.stroke();
  g.textAlign = 'center';
  g.fillStyle = INK;
  g.font = 'bold 72px Helvetica Neue, Helvetica, Arial';
  g.fillText(label, 256, 186);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    emissiveMap: texture,
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.55,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2), material);
  mesh.castShadow = true;
  return mesh;
}

export default defineTopic(
  function* (view, t) {
    // Built inside the generator, which runs several times per render, so
    // each run starts from the same state.
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100);
    camera.position.set(0, 1.2, 10);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight('#ffffff', 0.5));
    const spot = new THREE.SpotLight('#fff1d6', 80, 30, Math.PI / 7, 0.45, 1.1);
    spot.position.set(-4, 6, 6);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    scene.add(spot, spot.target);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({color: '#171b23', roughness: 0.95}));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.4;
    floor.receiveShadow = true;
    scene.add(floor);
    const mesh = card('L1');
    mesh.scale.setScalar(0.001);
    scene.add(mesh);
    spot.target.position.copy(mesh.position);

    view.add(
      <Three
        width={1920}
        height={1080}
        scene={scene}
        camera={camera}
        onRender={(renderer, s, c) => {
          renderer.shadowMap.enabled = true;
          renderer.shadowMap.type = THREE.PCFShadowMap;
          renderer.render(s, c);
        }}
      />,
    );
    const title = createRef<Txt>();
    view.add(<Txt ref={title} fontFamily={SANS} fontSize={56} fontWeight={700} fill={INK} y={-400} opacity={0} />);

    yield* t.at('DF1_Stage', 0);
    title().text('A stage in depth');
    // Alongside the voice, so the cue below is not held up: spawn() starts
    // the thread itself, never \`yield spawn(...)\`.
    spawn(title().opacity(1, 0.4));
    // Pops in with overshoot on the word that names it.
    yield* t.at('DF1_Stage', 0, 'card');
    yield* spring(PlopSpring, 0.001, 1, v => mesh.scale.setScalar(v));
    yield* t.at('DF2_Light', 0);
    yield* all(
      title().opacity(0, 0.3),
      tween(2.4, v => {
        mesh.rotation.y = easeInOutCubic(v, 0, -0.9);
        spot.target.position.set(easeInOutCubic(v, 0, 0.6), 0, 0);
      }),
    );
  },
  {background: '#0E1117'},
);
`;
