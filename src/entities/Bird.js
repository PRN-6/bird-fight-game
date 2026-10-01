import * as THREE from 'three';
import { Aerodynamics } from '../physics/Aerodynamics.js';

export class Bird extends THREE.Group {
  constructor() {
    super();

    // Flight Dynamics & Physics
    this.aerodynamics = new Aerodynamics();
    this.velocity = new THREE.Vector3(0, 0, -22); // Initial forward glide
    this.groundHeight = 0;
    this.isGrounded = false;
    this.isFlapping = false;
    this.stamina = 100;
    this.maxStamina = 100;
    this.staminaDrainRate = 18;
    this.staminaRegenRate = 22;
    this.health = 100;
    this.maxHealth = 100;

    // Flight orientation state (Yaw, Pitch, Roll in world/flight space)
    this.flightYaw = 0;
    this.flightPitch = 0;
    this.flightRoll = 0;

    // Combat & Attack Abilities Cooldowns (in seconds)
    this.cooldowns = {
      talon: 0,
      windBlade: 0,
      shockwave: 0
    };
    this.maxCooldowns = {
      talon: 0.6,
      windBlade: 1.2,
      shockwave: 4.5
    };

    // Inventory for Nest Base
    this.inventory = {
      twigs: 0,
      feathers: 0,
      pebbles: 0,
      berries: 0
    };

    // Animation variables
    this.wingAnimTime = 0;
    this.flapCycle = 0;

    // Build the 3D visual model
    this._buildModel();
  }

  _buildModel() {
    this.modelRoot = new THREE.Group();
    this.add(this.modelRoot);

    // Color Palette
    const featherMat = new THREE.MeshStandardMaterial({
      color: 0x362312,
      roughness: 0.7,
      metalness: 0.1,
      flatShading: true
    });
    const secondaryMat = new THREE.MeshStandardMaterial({
      color: 0x8a5a2e,
      roughness: 0.6,
      metalness: 0.1,
      flatShading: true
    });
    const bellyMat = new THREE.MeshStandardMaterial({
      color: 0xf3dfc8,
      roughness: 0.8,
      flatShading: true
    });
    const beakMat = new THREE.MeshStandardMaterial({
      color: 0xffa500,
      roughness: 0.3,
      metalness: 0.2
    });
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.1
    });
    const eyeGlowMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00
    });

    // Body (Streamlined along -Z forward axis)
    const bodyGeo = new THREE.ConeGeometry(0.38, 1.8, 8);
    bodyGeo.rotateX(Math.PI / 2);
    bodyGeo.scale(1.0, 0.7, 1.0);
    this.bodyMesh = new THREE.Mesh(bodyGeo, featherMat);
    this.bodyMesh.castShadow = true;
    this.modelRoot.add(this.bodyMesh);

    // Underbelly
    const bellyGeo = new THREE.ConeGeometry(0.32, 1.3, 7);
    bellyGeo.rotateX(Math.PI / 2);
    bellyGeo.scale(0.9, 0.5, 0.9);
    const bellyMesh = new THREE.Mesh(bellyGeo, bellyMat);
    bellyMesh.position.set(0, -0.08, 0.1);
    this.modelRoot.add(bellyMesh);

    // Head (Positioned towards -Z forward)
    this.head = new THREE.Group();
    this.head.position.set(0, 0.22, -0.9);

    const headGeo = new THREE.DodecahedronGeometry(0.28, 1);
    headGeo.scale(0.85, 0.95, 1.1);
    const headMesh = new THREE.Mesh(headGeo, secondaryMat);
    headMesh.castShadow = true;
    this.head.add(headMesh);

    // Raptor Beak
    const beakGeo = new THREE.ConeGeometry(0.12, 0.4, 5);
    beakGeo.rotateX(-Math.PI / 2); // Point forward (-Z)
    beakGeo.rotateX(0.2); // Hook down
    const beakMesh = new THREE.Mesh(beakGeo, beakMat);
    beakMesh.position.set(0, -0.06, -0.35);
    this.head.add(beakMesh);

    // Eyes
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeMat);
    eyeL.position.set(0.18, 0.08, -0.15);
    const eyeR = eyeL.clone();
    eyeR.position.x = -0.18;
    this.head.add(eyeL, eyeR);

    const irisL = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 4), eyeGlowMat);
    irisL.position.set(0.2, 0.09, -0.18);
    const irisR = irisL.clone();
    irisR.position.x = -0.2;
    this.head.add(irisL, irisR);

    this.modelRoot.add(this.head);

    // Tail Fan (Positioned towards +Z rear)
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.08, 0.9);

    const tailGeo = new THREE.BoxGeometry(0.9, 0.04, 0.8);
    const tailMesh = new THREE.Mesh(tailGeo, secondaryMat);
    tailMesh.position.set(0, 0, 0.4);
    tailMesh.castShadow = true;
    this.tail.add(tailMesh);
    this.modelRoot.add(this.tail);

    // --- LEFT WING ---
    this.leftWingRoot = new THREE.Group();
    this.leftWingRoot.position.set(0.3, 0.1, -0.2);

    const innerWingGeo = new THREE.BoxGeometry(0.95, 0.06, 0.58);
    const innerWingMeshL = new THREE.Mesh(innerWingGeo, featherMat);
    innerWingMeshL.position.set(0.48, 0, 0);
    innerWingMeshL.castShadow = true;
    this.leftWingRoot.add(innerWingMeshL);

    this.leftWingOuter = new THREE.Group();
    this.leftWingOuter.position.set(0.95, 0, 0);

    const outerWingGeo = new THREE.BoxGeometry(1.05, 0.04, 0.44);
    outerWingGeo.rotateY(-0.15);
    const outerWingMeshL = new THREE.Mesh(outerWingGeo, secondaryMat);
    outerWingMeshL.position.set(0.52, 0, 0.05);
    outerWingMeshL.castShadow = true;
    this.leftWingOuter.add(outerWingMeshL);

    const tipGeo = new THREE.ConeGeometry(0.2, 0.7, 4);
    tipGeo.rotateZ(-Math.PI / 2);
    const tipMeshL = new THREE.Mesh(tipGeo, bellyMat);
    tipMeshL.position.set(1.0, 0, 0.1);
    this.leftWingOuter.add(tipMeshL);

    this.leftWingRoot.add(this.leftWingOuter);
    this.modelRoot.add(this.leftWingRoot);

    // --- RIGHT WING ---
    this.rightWingRoot = new THREE.Group();
    this.rightWingRoot.position.set(-0.3, 0.1, -0.2);

    const innerWingMeshR = new THREE.Mesh(innerWingGeo, featherMat);
    innerWingMeshR.position.set(-0.48, 0, 0);
    innerWingMeshR.castShadow = true;
    this.rightWingRoot.add(innerWingMeshR);

    this.rightWingOuter = new THREE.Group();
    this.rightWingOuter.position.set(-0.95, 0, 0);

    const outerWingMeshR = new THREE.Mesh(outerWingGeo, secondaryMat);
    outerWingMeshR.position.set(-0.52, 0, 0.05);
    outerWingMeshR.castShadow = true;
    this.rightWingOuter.add(outerWingMeshR);

    const tipMeshR = new THREE.Mesh(tipGeo, bellyMat);
    tipMeshR.position.set(-1.0, 0, 0.1);
    tipMeshR.scale.set(-1, 1, 1);
    this.rightWingOuter.add(tipMeshR);

    this.rightWingRoot.add(this.rightWingOuter);
    this.modelRoot.add(this.rightWingRoot);

    // Talons
    const talonMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4 });
    const legGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.35);
    this.legL = new THREE.Mesh(legGeo, beakMat);
    this.legL.position.set(0.18, -0.28, 0.15);
    this.legL.rotation.x = -0.5;

    const clawGeo = new THREE.ConeGeometry(0.03, 0.15, 3);
    clawGeo.rotateX(Math.PI / 2);
    const clawL = new THREE.Mesh(clawGeo, talonMat);
    clawL.position.set(0, -0.18, -0.05);
    this.legL.add(clawL);

    this.legR = this.legL.clone();
    this.legR.position.x = -0.18;
    this.modelRoot.add(this.legL, this.legR);
  }

  update(delta, input, world) {
    if (this.isGrounded) {
      // Grounded mechanics
      this.velocity.set(0, 0, 0);
      this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegenRate * 2.0 * delta);

      if (input.flap || input.up || input.dive) {
        // Takeoff leap into the air!
        this.isGrounded = false;
        this.position.y += 2.0;
        this.aerodynamics.currentSpeed = 18;
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
        this.velocity.copy(fwd).multiplyScalar(18).add(new THREE.Vector3(0, 8, 0));
      }
      this._animateWings(delta, false, false, false);
      return;
    }

    // Stamina handling
    this.isFlapping = (input.flap && this.stamina > 2);
    if (this.isFlapping) {
      this.stamina = Math.max(0, this.stamina - this.staminaDrainRate * delta);
    } else {
      const regenRate = this.aerodynamics.inUpdraft ? this.staminaRegenRate * 2.5 : this.staminaRegenRate;
      this.stamina = Math.min(this.maxStamina, this.stamina + regenRate * delta);
    }

    // Flight Controls Integration (Smooth Euler/Quaternion Flight)
    // 1. Pitch: W tilts nose down (dives), S pulls nose up (climbs)
    const targetPitchChange = input.pitch * this.aerodynamics.pitchRate * delta;
    this.flightPitch = THREE.MathUtils.clamp(this.flightPitch + targetPitchChange, -1.3, 1.3);

    // 2. Roll: A banks left, D banks right
    if (input.roll !== 0) {
      this.flightRoll += input.roll * this.aerodynamics.rollRate * delta;
      this.flightRoll = THREE.MathUtils.clamp(this.flightRoll, -1.3, 1.3);
    } else {
      // Auto-level roll back to horizontal smoothly when roll keys released
      this.flightRoll = THREE.MathUtils.lerp(this.flightRoll, 0, delta * 3.5);
    }

    // 3. Bank-to-Turn Aerodynamic Yaw: Banking automatically turns the bird smoothly!
    const coordinatedYawRate = -Math.sin(this.flightRoll) * 1.8 * delta;
    const manualYawRate = input.yaw * this.aerodynamics.yawRate * delta;
    this.flightYaw += coordinatedYawRate + manualYawRate;

    // Apply combined orientation: Yaw (Y), Pitch (X), Roll (Z)
    const euler = new THREE.Euler(this.flightPitch, this.flightYaw, this.flightRoll, 'YXZ');
    this.quaternion.setFromEuler(euler);

    // World & Altitude checks
    this.groundHeight = world.getTerrainHeight(this.position.x, this.position.z);
    this.aerodynamics.altitude = this.position.y - this.groundHeight;

    // Updraft check
    const thermal = world.getUpdraftAt(this.position);
    this.aerodynamics.inUpdraft = thermal.active;
    this.aerodynamics.updraftStrength = thermal.strength;

    // Aerodynamics physics update
    const ambientWind = world.getWind(this.position);
    this.aerodynamics.updateFlight(this, delta, input, ambientWind);

    // Position integration
    this.position.addScaledVector(this.velocity, delta);

    // Ground collision & landing
    if (this.position.y <= this.groundHeight + 0.6) {
      if (this.aerodynamics.airspeed < 14 && this.velocity.y > -5) {
        // Smooth Perch / Land
        this.position.y = this.groundHeight + 0.6;
        this.isGrounded = true;
        this.flightPitch = 0;
        this.flightRoll = 0;
        this.velocity.set(0, 0, 0);
      } else {
        // Ground bounce
        this.position.y = this.groundHeight + 0.8;
        this.velocity.y = Math.abs(this.velocity.y) * 0.4;
        this.flightPitch = -0.2; // Push nose slightly up
        this.health = Math.max(0, this.health - 10);
      }
    }

    // Wing & Visual Model Animations
    this._animateWings(delta, this.isFlapping, input.dive, input.brake);

    // Cooldown ticks
    this.cooldowns.talon = Math.max(0, this.cooldowns.talon - delta);
    this.cooldowns.windBlade = Math.max(0, this.cooldowns.windBlade - delta);
    this.cooldowns.shockwave = Math.max(0, this.cooldowns.shockwave - delta);
  }

  performTalonStrike(combatSystem, sound, enemies) {
    if (this.cooldowns.talon > 0) return false;
    this.cooldowns.talon = this.maxCooldowns.talon;

    if (sound) sound.playTalonSlash();

    // Talon swipe animation
    this.legL.rotation.x = 0.5;
    this.legR.rotation.x = 0.5;
    setTimeout(() => {
      this.legL.rotation.x = -1.2;
      this.legR.rotation.x = -1.2;
    }, 200);

    // Melee Hit detection (Forward cone)
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
    const speed = this.aerodynamics.airspeed;
    // Massive damage multiplier if dive-bombing into enemy!
    const isDiveBombing = (this.aerodynamics.isTucking || speed > 35);
    const damage = isDiveBombing ? 85 : 45;

    let hit = false;
    enemies.forEach(enemy => {
      if (!enemy.isDead) {
        const toEnemy = enemy.position.clone().sub(this.position);
        const dist = toEnemy.length();
        if (dist < 7.5) {
          const angle = forward.angleTo(toEnemy);
          if (angle < Math.PI / 3) {
            enemy.takeDamage(damage, this);
            combatSystem.spawnHitParticles(enemy.position, isDiveBombing ? 0xff0044 : 0xffa500, 20);
            combatSystem.showDamageText(enemy.position, damage, isDiveBombing);
            if (sound) sound.playHitImpact();
            hit = true;
          }
        }
      }
    });

    return true;
  }

  performWindBlade(combatSystem, sound) {
    if (this.cooldowns.windBlade > 0) return false;
    this.cooldowns.windBlade = this.maxCooldowns.windBlade;

    if (sound) sound.playWindBlade();

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
    const spawnPos = this.position.clone().add(forward.clone().multiplyScalar(2.0));
    combatSystem.spawnWindBlade(spawnPos, forward, 40, 'player');
    return true;
  }

  performSonicShockwave(combatSystem, sound) {
    if (this.cooldowns.shockwave > 0) return false;
    this.cooldowns.shockwave = this.maxCooldowns.shockwave;

    if (sound) sound.playSonicShockwave();
    combatSystem.spawnSonicShockwave(this.position, 35, 60, 'player');
    return true;
  }

  _animateWings(delta, isFlapping, isDiving, isFlaring) {
    if (isFlapping) {
      const flapFrequency = 14;
      this.flapCycle += delta * flapFrequency;
      const flapAngle = Math.sin(this.flapCycle) * 0.7;
      const outerFlap = Math.sin(this.flapCycle - 0.4) * 0.5;

      this.leftWingRoot.rotation.z = flapAngle;
      this.rightWingRoot.rotation.z = -flapAngle;

      this.leftWingOuter.rotation.z = outerFlap;
      this.rightWingOuter.rotation.z = -outerFlap;

      this.leftWingRoot.rotation.y = Math.cos(this.flapCycle) * 0.15;
      this.rightWingRoot.rotation.y = -Math.cos(this.flapCycle) * 0.15;
    } else if (isDiving) {
      // Tucked dive pose
      this.leftWingRoot.rotation.set(0.4, 0.4, 1.2);
      this.rightWingRoot.rotation.set(0.4, -0.4, -1.2);
      this.leftWingOuter.rotation.set(0, 0, 0.3);
      this.rightWingOuter.rotation.set(0, 0, -0.3);
      this.tail.rotation.x = 0.3;
    } else if (isFlaring) {
      // Airbrake flare pose
      this.leftWingRoot.rotation.set(-0.35, -0.3, -0.5);
      this.rightWingRoot.rotation.set(-0.35, 0.3, 0.5);
      this.leftWingOuter.rotation.set(0, 0, 0.4);
      this.rightWingOuter.rotation.set(0, 0, -0.4);
      this.tail.rotation.x = -0.5;
    } else {
      // Majestic Glide with subtle wing flex
      this.wingAnimTime += delta * 2;
      const glideFlex = Math.sin(this.wingAnimTime) * 0.05;

      this.leftWingRoot.rotation.set(0.04, 0, 0.1 + glideFlex);
      this.rightWingRoot.rotation.set(0.04, 0, -0.1 - glideFlex);
      this.leftWingOuter.rotation.set(0, 0, 0.05);
      this.rightWingOuter.rotation.set(0, 0, -0.05);
      this.tail.rotation.x = -this.flightPitch * 0.4;
    }

    // Legs
    if (this.isGrounded) {
      this.legL.rotation.x = 0.2;
      this.legR.rotation.x = 0.2;
    } else {
      this.legL.rotation.x = -1.2;
      this.legR.rotation.x = -1.2;
    }
  }
}
