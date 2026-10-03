// Pollen Robotics Microduck Sandbox 023172c8a7d629b5258d90364c13bafe013abbfa.
// Keep the policy's actuator order, reference pose and timing together.
export const JOINT_NAMES = [
  'left_hip_yaw', 'left_hip_roll', 'left_hip_pitch', 'left_knee', 'left_ankle',
  'neck_pitch', 'head_pitch', 'head_yaw', 'head_roll',
  'right_hip_yaw', 'right_hip_roll', 'right_hip_pitch', 'right_knee', 'right_ankle',
];
export const DEFAULT_POSE = new Float32Array([
  0, -0.08726646259971647, -0.457924, -0.004940, 0.452984,
  0.3490658503988659, 0.3490658503988659, 0, 0,
  0, 0.08726646259971647, 0.457924, 0.004940, -0.452984,
]);
export const OBS_SIZE = 61;
export const TIMESTEP = 0.005;
export const DECIMATION = 4;
export const CONTROL_DT = TIMESTEP * DECIMATION;
export const ARENA_HALF = 1.5;
export const ARENA_WALL_H = 0.25;
export const ARENA_WALL_T = 0.05;
export const GRID_SECTION = 0.6;
export const SPAWN = [-0.6, 0, 0.12];
// The upstream arena shader includes relief, kept flat in this playground.
export const RELIEF_BUMPS = [[0.3, -0.9, 0.06, 0.55], [-0.9, 0.75, 0.05, 0.5], [0.6, 0.9, 0.07, 0.55]];
