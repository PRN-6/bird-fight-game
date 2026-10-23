import * as THREE from 'three';

export class Aerodynamics {
  constructor() {
    // Flight characteristics (small nimble songbird scale)
    this.cruiseSpeed = 11;      // m/s (~40 km/h) baseline comfortable glide
    this.minSpeed = 4;          // Stall threshold speed
    this.maxGlideSpeed = 18;    // Max speed during level glide
    this.maxDiveSpeed = 25;     // Max speed during tucked dive (~90 km/h)
    this.maxFlapSpeed = 16;     // Max speed while flapping (~58 km/h)
    this.currentSpeed = 11;     // Current forward airspeed

    this.pitchRate = 1.8;       // Pitch agility
    this.rollRate = 2.4;        // Roll agility
    this.yawRate = 1.2;         // Yaw agility

    // Dynamic telemetry
    this.airspeed = 11;
    this.altitude = 50;
    this.aoa = 0;               // Angle of attack in degrees
    this.gForce = 1.0;
    this.isStalled = false;
    this.isTucking = false;
    this.isFlaring = false;
    this.isLanding = false;
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
    this.isTucking = !!input.dive && !this.isLanding;
    this.isFlaring = !!input.brake && !this.isLanding;

    // 3. Speed & Energy Dynamics (Trade height for speed, speed for height)
    // Pitch inclination: positive when pointing down, negative when pointing up
    const pitchInclination = -this._forward.y; // 1 when vertical dive, -1 when vertical climb

    // Acceleration / Deceleration
    let targetSpeed = this.cruiseSpeed;

    if (this.isLanding) {
      // Settle onto a branch: bleed off speed so the bird can touch down
      targetSpeed = Math.max(2.0, this.cruiseSpeed * 0.22);
      this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, targetSpeed, delta * 2.4);
    } else if (this.isTucking) {
      // Dive mode: aerodynamic tuck allows rapid acceleration towards max dive speed
      targetSpeed = this.cruiseSpeed + (this.maxDiveSpeed - this.cruiseSpeed) * Math.max(0.4, pitchInclination + 0.5);
      this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, targetSpeed, delta * 2.2);
    } else if (this.isFlaring) {
      // Airbrake mode: rapidly decelerate
      targetSpeed = Math.max(2.5, this.minSpeed * 0.7);
      this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, targetSpeed, delta * 3.5);
    } else {
      // Normal Glide: Gravity accelerates during dive, drag decelerates during climb
      if (pitchInclination > 0) {
        // Diving: Convert potential energy to kinetic speed
        targetSpeed = this.cruiseSpeed + (this.maxGlideSpeed - this.cruiseSpeed) * pitchInclination;
        this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, targetSpeed, delta * 1.5);
      } else {
        // Climbing: Speed bleeds off as we climb
        targetSpeed = Math.max(this.minSpeed, this.cruiseSpeed + pitchInclination * 7);
        this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, targetSpeed, delta * 1.8);
      }
    }

    // Flapping Thrust Impulse
    if (bird.isFlapping && bird.stamina > 0 && !this.isLanding) {
      const flapAccel = (this.isTucking ? 5 : 11);
      const flapCeiling = this.isTucking ? this.maxDiveSpeed : this.maxFlapSpeed;
      this.currentSpeed = Math.min(flapCeiling, this.currentSpeed + flapAccel * delta);
    }

    // Stall Check
    this.isStalled = (this.currentSpeed < this.minSpeed + 0.5 && pitchInclination < -0.2 && !this.isLanding);

    // Angle of Attack (AoA) estimation
    this.aoa = pitchInclination * 25; // in degrees for display

    // Updraft / Thermal lift
    let verticalUpdraftVel = 0;
    if (this.inUpdraft && !this.isLanding) {
      verticalUpdraftVel = this.updraftStrength * 0.75;
      // Thermals also restore some forward energy
      this.currentSpeed = Math.min(this.maxGlideSpeed, this.currentSpeed + 2.5 * delta);
    }

    // 4. Calculate final 3D Velocity Vector
    // The bird moves primarily forward along its orientation vector
    const forwardVel = this._forward.clone().multiplyScalar(this.currentSpeed);

    // If stalled, add extra downward gravity slip
    if (this.isStalled) {
      forwardVel.y -= 10 * delta;
    }

    // Airbrake trades forward speed for a controlled sink onto a branch
    if (this.isFlaring) {
      forwardVel.y -= 2.6;
    }

    // Gentle sink while settling onto a perch
    if (this.isLanding) {
      forwardVel.y -= 3.5;
    }

    // Add vertical thermal wind
    forwardVel.y += verticalUpdraftVel;

    // Add ambient wind drift
    forwardVel.addScaledVector(wind, this.isLanding ? 0.08 : 0.22);

    // Smoothly update bird velocity with momentum inertia
    bird.velocity.lerp(forwardVel, delta * 6.0);

    this.airspeed = bird.velocity.length();
    this.gForce = 1.0 + (pitchInclination * 0.8) + (this.isTucking ? 0.6 : 0);
  }
}
