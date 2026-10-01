import * as THREE from 'three';

export class Aerodynamics {
  constructor() {
    // Flight characteristics
    this.cruiseSpeed = 22;      // m/s (~80 km/h) baseline comfortable glide
    this.minSpeed = 8;          // Stall threshold speed
    this.maxGlideSpeed = 38;    // Max speed during level glide
    this.maxDiveSpeed = 55;     // Max speed during tucked dive (~200 km/h)
    this.currentSpeed = 22;     // Current forward airspeed

    this.pitchRate = 1.8;       // Pitch agility
    this.rollRate = 2.4;        // Roll agility
    this.yawRate = 1.2;         // Yaw agility

    // Dynamic telemetry
    this.airspeed = 22;
    this.altitude = 50;
    this.aoa = 0;               // Angle of attack in degrees
    this.gForce = 1.0;
    this.isStalled = false;
    this.isTucking = false;
    this.isFlaring = false;
    this.inUpdraft = false;
    this.updraftStrength = 0;

    // Vectors for reuse
    this._forward = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._right = new THREE.Vector3();
  }

  updateFlight(bird, delta, input, wind = new THREE.Vector3(0, 0, 0)) {
    // 1. Determine Forward, Up, Right vectors from bird orientation
    // Three.js convention: forward is -Z in local space
    this._forward.set(0, 0, -1).applyQuaternion(bird.quaternion);
    this._up.set(0, 1, 0).applyQuaternion(bird.quaternion);
    this._right.set(1, 0, 0).applyQuaternion(bird.quaternion);

    // 2. Flight Modes
    this.isTucking = !!input.dive;
    this.isFlaring = !!input.brake;

    // 3. Speed & Energy Dynamics (Trade height for speed, speed for height)
    // Pitch inclination: positive when pointing down, negative when pointing up
    const pitchInclination = -this._forward.y; // 1 when vertical dive, -1 when vertical climb

    // Acceleration / Deceleration
    let targetSpeed = this.cruiseSpeed;

    if (this.isTucking) {
      // Dive mode: aerodynamic tuck allows rapid acceleration towards max dive speed
      targetSpeed = this.cruiseSpeed + (this.maxDiveSpeed - this.cruiseSpeed) * Math.max(0.4, pitchInclination + 0.5);
      this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, targetSpeed, delta * 2.2);
    } else if (this.isFlaring) {
      // Airbrake mode: rapidly decelerate
      targetSpeed = Math.max(6, this.minSpeed * 0.7);
      this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, targetSpeed, delta * 3.5);
    } else {
      // Normal Glide: Gravity accelerates during dive, drag decelerates during climb
      if (pitchInclination > 0) {
        // Diving: Convert potential energy to kinetic speed
        targetSpeed = this.cruiseSpeed + (this.maxGlideSpeed - this.cruiseSpeed) * pitchInclination;
        this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, targetSpeed, delta * 1.5);
      } else {
        // Climbing: Speed bleeds off as we climb
        targetSpeed = Math.max(this.minSpeed, this.cruiseSpeed + pitchInclination * 14);
        this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, targetSpeed, delta * 1.8);
      }
    }

    // Flapping Thrust Impulse
    if (bird.isFlapping && bird.stamina > 0) {
      const flapAccel = (this.isTucking ? 10 : 22);
      this.currentSpeed = Math.min(this.maxDiveSpeed, this.currentSpeed + flapAccel * delta);
    }

    // Stall Check
    this.isStalled = (this.currentSpeed < this.minSpeed + 0.5 && pitchInclination < -0.2);

    // Angle of Attack (AoA) estimation
    this.aoa = pitchInclination * 25; // in degrees for display

    // Updraft / Thermal lift
    let verticalUpdraftVel = 0;
    if (this.inUpdraft) {
      verticalUpdraftVel = this.updraftStrength * 1.2;
      // Thermals also restore some forward energy
      this.currentSpeed = Math.min(this.maxGlideSpeed, this.currentSpeed + 5 * delta);
    }

    // 4. Calculate final 3D Velocity Vector
    // The bird moves primarily forward along its orientation vector
    const forwardVel = this._forward.clone().multiplyScalar(this.currentSpeed);

    // If stalled, add extra downward gravity slip
    if (this.isStalled) {
      forwardVel.y -= 12 * delta;
    }

    // Add vertical thermal wind
    forwardVel.y += verticalUpdraftVel;

    // Add ambient wind drift
    forwardVel.addScaledVector(wind, 0.3);

    // Smoothly update bird velocity with momentum inertia
    bird.velocity.lerp(forwardVel, delta * 6.0);

    this.airspeed = bird.velocity.length();
    this.gForce = 1.0 + (pitchInclination * 0.8) + (this.isTucking ? 0.6 : 0);
  }
}
