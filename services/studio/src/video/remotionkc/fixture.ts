/**
 * The remotionkc doctor's fixture (phase 3 of docs/STUDIO-VIDEO-TOOLS.md): a
 * small topic that uses what this tool is chosen for, a bar chart from data
 * with a KaTeX formula and a spring, then a lit three.js card with a shadow
 * on a stage (`@remotion/three`), each cued on a spoken word, so a doctor
 * that renders it proves the parts a real job needs: WebGL through Metal
 * inside the profile, KaTeX's fonts, both ports (the server and Chrome's
 * DevTools), narration in the narration profile, and the sidecars after the
 * build.
 *
 * It is also the manual's worked composition (`manual.ts`): the agent learns
 * from code this machine has rendered inside the same profile its own will.
 */

/** Two short chapters, about ten seconds voiced. */
export const FIXTURE_NARRATION = [
  {
    scene: "DF1_Chart",
    title: "A chart from data",
    lines: ["Three bars rise from real numbers, and the formula beside them adds them up."],
  },
  {
    scene: "DF2_Stage",
    title: "A stage in depth",
    lines: ["Then a lit card turns on a stage, and its shadow turns with it."],
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
  composition: composition.tsx
  output: doctor_fixture.mp4
`;

/** The worked composition: a chart from data with a formula, then a lit three.js card with a shadow. */
export const FIXTURE_COMPOSITION = `// The doctor's fixture and the manual's worked composition: a bar chart from
// data with a KaTeX formula, then a lit three.js card with a shadow on a
// stage, each cued on a spoken word.
import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { KatexFonts, NarrationTrack, OUT, Tex, defineTopic, ramp, sceneCues, springAt, type TimedScene, type TopicProps } from "#lib";

const C = { bg: "#0E1117", ink: "#E9EDF5", dim: "#8B94A8", accent: "#F5C542", bar: "#5B8DEF" };
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const DATA = [
  { label: "L1", value: 4 },
  { label: "L2", value: 12 },
  { label: "L3", value: 40 },
];

const Chart: React.FC<{ scene: TimedScene }> = ({ scene }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cue = sceneCues(scene);
  const rise = cue.at(0, "bars");
  const formula = ramp(f, cue.at(0, "formula"), 15, OUT);
  const max = Math.max(...DATA.map((d) => d.value));
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: SANS, padding: 120 }}>
      <div style={{ fontSize: 60, fontWeight: 700, color: C.ink }}>A chart from data</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 60, height: 520, marginTop: 80 }}>
        {DATA.map((d, i) => {
          const grow = springAt(f, rise + i * 6, fps, { damping: 14 });
          return (
            <div key={d.label} style={{ textAlign: "center", color: C.dim, fontSize: 36 }}>
              <div style={{ width: 160, height: (d.value / max) * 460 * grow, background: C.bar, borderRadius: 12 }} />
              <div style={{ marginTop: 16 }}>{d.label}</div>
            </div>
          );
        })}
        <div style={{ marginLeft: 120, opacity: formula, color: C.accent }}>
          <Tex tex={String.raw\`\\sum_i c_i = 56\`} size={64} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Camera: React.FC<{ f: number }> = ({ f }) => {
  const camera = useThree((s) => s.camera);
  camera.position.set(Math.sin(f * 0.004) * 6, 2.2, 7);
  camera.lookAt(0, 0, 0);
  return null;
};

const Stage: React.FC<{ scene: TimedScene }> = ({ scene }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const cue = sceneCues(scene);
  const turn = ramp(f, cue.at(0, "turns"), 45);
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <ThreeCanvas width={width} height={height} shadows>
        <Camera f={f} />
        <ambientLight intensity={0.4} />
        <spotLight position={[-4, 6, 5]} angle={0.5} penumbra={0.4} intensity={160} castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]} receiveShadow>
          <planeGeometry args={[30, 30]} />
          <meshStandardMaterial color="#171B23" roughness={0.95} />
        </mesh>
        <mesh rotation={[0, -0.9 * turn, 0]} castShadow>
          <boxGeometry args={[2.6, 1.6, 0.12]} />
          <meshStandardMaterial color={C.accent} emissive={C.accent} emissiveIntensity={0.15} metalness={0.2} roughness={0.4} />
        </mesh>
      </ThreeCanvas>
      <div style={{ position: "absolute", top: 100, left: 120, fontFamily: SANS, fontSize: 60, fontWeight: 700, color: C.ink }}>A stage in depth</div>
    </AbsoluteFill>
  );
};

const VIEWS: Record<string, React.FC<{ scene: TimedScene }>> = { DF1_Chart: Chart, DF2_Stage: Stage };

const Fixture: React.FC<TopicProps> = ({ timeline }) => {
  if (!timeline) return null;
  return (
    <KatexFonts>
      <AbsoluteFill style={{ background: C.bg }}>
        <NarrationTrack timeline={timeline} />
        {timeline.scenes.map((s) => {
          const View = VIEWS[s.scene]!;
          return (
            <Sequence key={s.scene} from={s.from} durationInFrames={s.durationInFrames}>
              <View scene={s} />
            </Sequence>
          );
        })}
      </AbsoluteFill>
    </KatexFonts>
  );
};

export default defineTopic({ component: Fixture });
`;
