import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Aerodynamics } from '../physics/Aerodynamics.js';

export class Bird extends THREE.Group {
  constructor() {
    super();

    // Small Nimble Songbird Flight Dynamics & Physics
    this.aerodynamics = new Aerodynamics();
    this.velocity = new THREE.Vector3(0, 0, -10);
    this.groundHeight = 0;
this.isGrounded = false; // Perched on a tree branch or on forest floor
    this.perchedSurface = { isBranch: false, branch: null };
    this.isFlapping = false;
    this.wantsLanding = false;
    this.impactCooldown = 0;
    this.hitRadius = 0.55;   // Collision radius against trunks, branches and logs
    this.perchOffset = 0.3;

    // Vitals & Stats
    this.stamina = 100;
    this.maxStamina = 100;
    this.staminaDrainRate = 16;
    this.staminaRegenRate = 24;
    this.health = 100;
    this.maxHealth = 100;

    // Small bird agile orientation state
    this.flightYaw = 0;
    this.flightPitch = 0;
    this.flightRoll = 0;

    // Perched & Landing Animation Timers
    this.landingTimer = 0; // 0 to 1 smooth crouch & tuck transition
    this.isLanding = false;
    this.hopTimer = 0;
    this.isHopping = false;
    this.idleHeadTime = 0;
    this.peckTimer = 0;

    // Combat & Attack Abilities Cooldowns (in seconds)
    this.cooldowns = {
      talon: 0,
      windBlade: 0,
      shockwave: 0
    };
    this.maxCooldowns = {
      talon: 0.5,
      windBlade: 1.0,
      shockwave: 4.0
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

    // GLTF Model & Animations
    this.mixer = null;
    this.animations = {};
    this.currentAction = null;

    // Build the 3D visual model
    this._buildModel();
  }

  _buildModel() {
    this.modelRoot = new THREE.Group();
    this.modelRoot.scale.set(0.38, 0.38, 0.38);
    this.add(this.modelRoot);

    const loader = new GLTFLoader();
    loader.load(
      './elegant_celestial_giant_bird.glb',
      (gltf) => {
        const model = gltf.scene;
        this.modelRoot.add(model);
        this.mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach((clip) => {
          this.animations[clip.name] = this.mixer.clipAction(clip);
        });
        if (this.animations['Idle']) {
          this.animations['Idle'].play();
          this.currentAction = this.animations['Idle'];
        }
      },
      undefined,
      (error) => {
        console.error('Error loading bird model:', error);
        this._buildPrimitiveModel();
      }
    );
  }

  _buildPrimitiveModel() {
    // Proportional small bird scale (tiny songbird exploring giant redwood giants!)
    this.modelRoot.scale.set(0.38, 0.38, 0.38);

    // Color Palette: Vibrant Forest Songbird (Sapphire Bluebird / Forest Robin)
    const featherPrimaryMat = new THREE.MeshStandardMaterial({
      color: 0x1d70b8, // Cobalt-sapphire blue
      roughness: 0.6,
      metalness: 0.15,
      flatShading: true
    });
    const featherSecondaryMat = new THREE.MeshStandardMaterial({
      color: 0x124578, // Wing navy
      roughness: 0.7,
      metalness: 0.1,
      flatShading: true
    });
    const chestWarmMat = new THREE.MeshStandardMaterial({
      color: 0xe07a38, // Warm robin orange chest / throat
      roughness: 0.8,
      flatShading: true
    });
    const bellyMat = new THREE.MeshStandardMaterial({
      color: 0xf4eedb, // Creamy ivory belly
      roughness: 0.85,
      flatShading: true
    });
    const beakMat = new THREE.MeshStandardMaterial({
      color: 0x222222, // Sleek black beak
      roughness: 0.2,
      metalness: 0.3
    });
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x050505,
      roughness: 0.1
    });
    const eyeHighlightMat = new THREE.MeshBasicMaterial({
      color: 0xffffff
    });

    // 1. Plump Streamlined Torso
    const bodyGeo = new THREE.SphereGeometry(0.55, 8, 8);
    bodyGeo.scale(0.85, 0.9, 1.4);
    this.bodyMesh = new THREE.Mesh(bodyGeo, featherPrimaryMat);
    this.bodyMesh.castShadow = true;
    this.modelRoot.add(this.bodyMesh);

    // Warm Orange Chest
    const chestGeo = new THREE.SphereGeometry(0.48, 7, 7);
    chestGeo.scale(0.8, 0.85, 1.0);
    const chestMesh = new THREE.Mesh(chestGeo, chestWarmMat);
    chestMesh.position.set(0, -0.05, -0.2);
    this.modelRoot.add(chestMesh);

    // Soft Creamy Underbelly
    const bellyGeo = new THREE.SphereGeometry(0.44, 7, 7);
    bellyGeo.scale(0.75, 0.7, 1.1);
    const bellyMesh = new THREE.Mesh(bellyGeo, bellyMat);
    bellyMesh.position.set(0, -0.15, 0.2);
    this.modelRoot.add(bellyMesh);

    // 2. Cute Round Head with Inquisitive Look
    this.head = new THREE.Group();
    this.head.position.set(0, 0.32, -0.65);

    const headGeo = new THREE.SphereGeometry(0.38, 8, 8);
    headGeo.scale(0.95, 1.0, 1.05);
    const headMesh = new THREE.Mesh(headGeo, featherPrimaryMat);
    headMesh.castShadow = true;
    this.head.add(headMesh);

    // Songbird Beak
    const beakGeo = new THREE.ConeGeometry(0.1, 0.38, 5);
    beakGeo.rotateX(-Math.PI / 2);
    const beakMesh = new THREE.Mesh(beakGeo, beakMat);
    beakMesh.position.set(0, -0.04, -0.42);
    this.head.add(beakMesh);

    // Sparkling Eyes
    const eyeGeo = new THREE.SphereGeometry(0.08, 6, 6);
    const glintGeo = new THREE.SphereGeometry(0.025, 4, 4);

    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(0.25, 0.1, -0.12);
    const glintL = new THREE.Mesh(glintGeo, eyeHighlightMat);
    glintL.position.set(0.28, 0.13, -0.16);
    this.head.add(eyeL, glintL);

    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(-0.25, 0.1, -0.12);
    const glintR = new THREE.Mesh(glintGeo, eyeHighlightMat);
    glintR.position.set(-0.28, 0.13, -0.16);
    this.head.add(eyeR, glintR);

    this.modelRoot.add(this.head);

    // 3. Tail Fan
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.05, 0.65);

    const tailGeo = new THREE.BoxGeometry(0.7, 0.03, 0.95);
    const tailMesh = new THREE.Mesh(tailGeo, featherSecondaryMat);
    tailMesh.position.set(0, 0, 0.45);
    tailMesh.castShadow = true;
    this.tail.add(tailMesh);
    this.modelRoot.add(this.tail);

    // 4. --- LEFT ARTICULATED WING ---
    this.leftWingRoot = new THREE.Group();
    this.leftWingRoot.position.set(0.35, 0.12, -0.15);

    const innerWingGeo = new THREE.BoxGeometry(0.85, 0.04, 0.48);
    const innerWingMeshL = new THREE.Mesh(innerWingGeo, featherPrimaryMat);
    innerWingMeshL.position.set(0.42, 0, 0);
    innerWingMeshL.castShadow = true;
    this.leftWingRoot.add(innerWingMeshL);

    this.leftWingOuter = new THREE.Group();
    this.leftWingOuter.position.set(0.85, 0, 0);

    const outerWingGeo = new THREE.BoxGeometry(0.95, 0.03, 0.38);
    outerWingGeo.rotateY(-0.15);
    const outerWingMeshL = new THREE.Mesh(outerWingGeo, featherSecondaryMat);
    outerWingMeshL.position.set(0.46, 0, 0.04);
    outerWingMeshL.castShadow = true;
    this.leftWingOuter.add(outerWingMeshL);

    const tipGeo = new THREE.ConeGeometry(0.16, 0.6, 4);
    tipGeo.rotateZ(-Math.PI / 2);
    const tipMeshL = new THREE.Mesh(tipGeo, chestWarmMat);
    tipMeshL.position.set(0.9, 0, 0.08);
    this.leftWingOuter.add(tipMeshL);

    this.leftWingRoot.add(this.leftWingOuter);
    this.modelRoot.add(this.leftWingRoot);

    // 5. --- RIGHT ARTICULATED WING ---
    this.rightWingRoot = new THREE.Group();
    this.rightWingRoot.position.set(-0.35, 0.12, -0.15);

    const innerWingMeshR = new THREE.Mesh(innerWingGeo, featherPrimaryMat);
    innerWingMeshR.position.set(-0.42, 0, 0);
    innerWingMeshR.castShadow = true;
    this.rightWingRoot.add(innerWingMeshR);

    this.rightWingOuter = new THREE.Group();
    this.rightWingOuter.position.set(-0.85, 0, 0);

    const outerWingMeshR = new THREE.Mesh(outerWingGeo, featherSecondaryMat);
    outerWingMeshR.position.set(-0.46, 0, 0.04);
    outerWingMeshR.castShadow = true;
    this.rightWingOuter.add(outerWingMeshR);

    const tipMeshR = new THREE.Mesh(tipGeo, chestWarmMat);
    tipMeshR.position.set(-0.9, 0, 0.08);
    tipMeshR.scale.set(-1, 1, 1);
    this.rightWingOuter.add(tipMeshR);

    this.rightWingRoot.add(this.rightWingOuter);
    this.modelRoot.add(this.rightWingRoot);

    // 6. Articulated Perching Talons & Claws
    const legMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4 });
    const clawMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.3 });

    const legGeo = new THREE.CylinderGeometry(0.035, 0.025, 0.32);
    this.legL = new THREE.Group();
    this.legL.position.set(0.15, -0.28, 0.1);

    const thighMeshL = new THREE.Mesh(legGeo, legMat);
    thighMeshL.position.y = -0.16;
    this.legL.add(thighMeshL);

    // Forward & back claws for branch gripping
    const clawGeo = new THREE.ConeGeometry(0.025, 0.15, 3);
    clawGeo.rotateX(Math.PI / 2);
    this.clawL = new THREE.Mesh(clawGeo, clawMat);
    this.clawL.position.set(0, -0.32, -0.06);
    this.legL.add(this.clawL);

    const clawBackGeo = new THREE.ConeGeometry(0.022, 0.12, 3);
    clawBackGeo.rotateX(-Math.PI / 2);
    this.clawBackL = new THREE.Mesh(clawBackGeo, clawMat);
    this.clawBackL.position.set(0, -0.32, 0.06);
    this.legL.add(this.clawBackL);

    this.legR = this.legL.clone();
    this.legR.position.x = -0.15;
    this.modelRoot.add(this.legL, this.legR);
  }

  // Toggle auto-landing: perch on the branch / ground below, or take off again
  toggleLanding() {
    if (this.isGrounded) {
      this.takeOff();
      return 'takeoff';
    }
    this.wantsLanding = !this.wantsLanding;
    return this.wantsLanding ? 'land' : 'cancel';
  }

  takeOff() {
    if (!this.isGrounded) return;
    this.isGrounded = false;
    this.wantsLanding = false;
    this.landingTimer = 0;
    this.position.y += 1.6;
    this.aerodynamics.currentSpeed = 9;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
    fwd.y = Math.max(fwd.y, 0.35);
    fwd.normalize();
    this.velocity.copy(fwd).multiplyScalar(9).add(new THREE.Vector3(0, 5.5, 0));
    this.head.rotation.set(0, 0, 0);
  }

update(delta, input, world) {
    // Solid obstacle collision: trunks & branches block the bird
    // (perched birds use a tight radius so they sit right on the surface)
    const collideRadius = this.isGrounded ? 0.15 : this.hitRadius;
    const impact = world.resolveObstacleCollision(this.position, this.velocity, collideRadius);
    if (impact.hit) {
      this.aerodynamics.currentSpeed *= 0.7;
      this.impactCooldown = Math.max(0, (this.impactCooldown || 0) - delta);
      if (impact.impactSpeed > 3.5 && this.impactCooldown <= 0) {
        this.impactCooldown = 0.4;
        const damage = THREE.MathUtils.clamp((impact.impactSpeed - 3.0) * 2.5, 2, 28);
        this.health = Math.max(0, this.health - damage);
        this.flightPitch = THREE.MathUtils.clamp(this.flightPitch + 0.2, -1.35, 1.35);
        if (typeof globalThis.onBirdImpact === 'function') {
          globalThis.onBirdImpact(this.position.clone(), damage, impact.normal.clone());
        }
      }
    }

const perchInfo = world.getPerchSurface(this.position, this.hitRadius);
    this.groundHeight = perchInfo.height;
    this.perchOffset = perchInfo.isBranch ? 0.22 : 0.25;
    this.perchedSurface.isBranch = perchInfo.isBranch;
    this.perchedSurface.branch = perchInfo.branch;

    // ================= PERCHED ON A BRANCH OR ON THE FOREST FLOOR =================
    if (this.isGrounded) {
      this.velocity.set(0, 0, 0);
      this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegenRate * 2.8 * delta);
      this.landingTimer = Math.min(1.0, this.landingTimer + delta * 4.0);
      this.wantsLanding = false;

      const stepSpeed = 4.0;

      // Walk / hop forward and backward along the perch
      if (input.pitch !== 0) {
        const dirSign = input.pitch < 0 ? 1 : -1; // W forward, S backward
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
        fwd.y = 0;
        if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
        fwd.normalize();

const target = this.position.clone().addScaledVector(fwd, dirSign * stepSpeed * delta);
        const nextPerch = world.getPerchSurface(target, this.hitRadius);
        // Refuse to step off a ledge / off the end of a branch
        if (nextPerch.height > this.position.y - 2.5) {
          this.position.x = target.x;
          this.position.z = target.z;
          this.groundHeight = nextPerch.height;
          this.perchedSurface.isBranch = nextPerch.isBranch;
          this.perchedSurface.branch = nextPerch.branch;
          this.isHopping = true;
        }
      } else {
        this.isHopping = false;
      }

      // Pivot / turn in place
      if (input.roll !== 0 || input.yaw !== 0) {
        this.flightYaw += (input.roll || input.yaw) * 3.5 * delta;
        this.quaternion.setFromEuler(new THREE.Euler(0, this.flightYaw, 0, 'YXZ'));
      }

      // Settle onto the perch surface
      this.position.y = THREE.MathUtils.lerp(
        this.position.y,
        this.groundHeight + this.perchOffset,
        delta * 9.0
      );

      // Perched Idle Animations
      this.idleHeadTime += delta * 1.6;
      this.peckTimer += delta;

      const breathBob = Math.sin(this.idleHeadTime * 2.5) * 0.02;
      this.bodyMesh.position.y = breathBob;

      const headTurn = Math.sin(this.idleHeadTime * 0.8) * 0.45 + Math.sin(this.idleHeadTime * 2.4) * 0.2;
      const headTilt = Math.sin(this.idleHeadTime * 1.2) * 0.2;
      this.head.rotation.set(headTilt, headTurn, headTurn * 0.2);

      this.tail.rotation.y = Math.sin(this.idleHeadTime * 1.8) * 0.25;
      this.tail.rotation.x = 0.25 + Math.sin(this.idleHeadTime * 3.0) * 0.08;

      // Spring into flight on flap / dive
      if (input.flap || input.dive) {
        this.takeOff();
      }

      this._animateWings(delta, false, false, false, true);
      return;
    }

    // ================= IN-FLIGHT AERODYNAMICS & CONTROLS =================
    this.landingTimer = Math.max(0, this.landingTimer - delta * 3.0);

    // Stamina handling
    this.isFlapping = (input.flap && this.stamina > 2);
    if (this.isFlapping) {
      this.stamina = Math.max(0, this.stamina - this.staminaDrainRate * delta);
    } else {
      const regenRate = this.aerodynamics.inUpdraft ? this.staminaRegenRate * 2.2 : this.staminaRegenRate;
      this.stamina = Math.min(this.maxStamina, this.stamina + regenRate * delta);
    }

    // Small Bird Agility
    const pitchAgility = 2.4;
    const rollAgility = 3.2;

    const targetPitchChange = input.pitch * pitchAgility * delta;
    this.flightPitch = THREE.MathUtils.clamp(this.flightPitch + targetPitchChange, -1.35, 1.35);

    if (input.roll !== 0) {
      this.flightRoll += input.roll * rollAgility * delta;
      this.flightRoll = THREE.MathUtils.clamp(this.flightRoll, -1.4, 1.4);
    } else {
      this.flightRoll = THREE.MathUtils.lerp(this.flightRoll, 0, delta * 4.0);
    }

    const coordinatedYawRate = -Math.sin(this.flightRoll) * 2.2 * delta;
    const manualYawRate = input.yaw * 1.5 * delta;
    this.flightYaw += coordinatedYawRate + manualYawRate;

    const euler = new THREE.Euler(this.flightPitch, this.flightYaw, this.flightRoll, 'YXZ');
    this.quaternion.setFromEuler(euler);

    // Altitude & Updraft
    this.aerodynamics.altitude = this.position.y - this.groundHeight;

    const thermal = world.getUpdraftAt(this.position);
    this.aerodynamics.inUpdraft = thermal.active;
    this.aerodynamics.updraftStrength = thermal.strength;

    // Auto-landing assist: L toggles it, airbrake near the ground also settles the bird
    const lowOverSurface = this.aerodynamics.altitude < 6.0;
    this.aerodynamics.isLanding =
      this.wantsLanding || (input.brake && lowOverSurface && this.aerodynamics.currentSpeed < 9);

    const ambientWind = world.getWind(this.position);
    this.aerodynamics.updateFlight(this, delta, input, ambientWind);

    this.position.addScaledVector(this.velocity, delta);

    // Keep the bird out of the terrain as well
    const terrainY = world.getTerrainHeight(this.position.x, this.position.z);
    if (this.position.y < terrainY + 0.3) {
      this.position.y = terrainY + 0.3;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }

    // Touchdown detection: settle only when slow and descending gently
    const landingThreshold = this.groundHeight + this.perchOffset;
    if (this.position.y <= landingThreshold + 0.12) {
const gentle = this.velocity.y > -4.0;
      const slow = this.aerodynamics.airspeed < 7.0;
      if (gentle && slow) {
        this.position.y = landingThreshold;
        this.isGrounded = true;
        this.flightPitch = 0;
        this.flightRoll = 0;
        this.wantsLanding = false;
        this.velocity.set(0, 0, 0);
        if (typeof globalThis.onBirdLanded === 'function') {
          globalThis.onBirdLanded(perchInfo.isBranch);
        }
      } else {
        // Bounce off the branch / forest floor
        this.position.y = landingThreshold + 0.45;
        this.velocity.y = Math.abs(this.velocity.y) * 0.3;
        this.flightPitch = -0.15;
        this.health = Math.max(0, this.health - 4);
        if (typeof globalThis.onBirdImpact === 'function') {
          globalThis.onBirdImpact(this.position.clone(), 4, new THREE.Vector3(0, 1, 0));
        }
      }
    }

    // Wing & Visual Model Animations
    this._animateWings(delta, this.isFlapping, input.dive, input.brake, false);

    // Cooldown ticks
    this.cooldowns.talon = Math.max(0, this.cooldowns.talon - delta);
    this.cooldowns.windBlade = Math.max(0, this.cooldowns.windBlade - delta);
    this.cooldowns.shockwave = Math.max(0, this.cooldowns.shockwave - delta);
  }

  performTalonStrike(combatSystem, sound, enemies) {
    if (this.cooldowns.talon > 0) return false;
    this.cooldowns.talon = this.maxCooldowns.talon;

    if (sound) sound.playTalonSlash();

    this.legL.rotation.x = 0.6;
    this.legR.rotation.x = 0.6;
    setTimeout(() => {
      this.legL.rotation.x = -1.1;
      this.legR.rotation.x = -1.1;
    }, 180);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
    const speed = this.aerodynamics.airspeed;
    const isDiveBombing = (this.aerodynamics.isTucking || speed > 15);
    const damage = isDiveBombing ? 80 : 40;

    enemies.forEach(enemy => {
      if (!enemy.isDead) {
        const toEnemy = enemy.position.clone().sub(this.position);
        const dist = toEnemy.length();
        if (dist < 7.0) {
          const angle = forward.angleTo(toEnemy);
          if (angle < Math.PI / 2.8) {
            enemy.takeDamage(damage, this);
            combatSystem.spawnHitParticles(enemy.position, isDiveBombing ? 0xff0055 : 0xffaa00, 18);
            combatSystem.showDamageText(enemy.position, damage, isDiveBombing);
            if (sound) sound.playHitImpact();
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
    const spawnPos = this.position.clone().add(forward.clone().multiplyScalar(1.2));
    combatSystem.spawnWindBlade(spawnPos, forward, 38, 'player');
    return true;
  }

  performSonicShockwave(combatSystem, sound) {
    if (this.cooldowns.shockwave > 0) return false;
    this.cooldowns.shockwave = this.maxCooldowns.shockwave;

    if (sound) sound.playSonicShockwave();
    combatSystem.spawnSonicShockwave(this.position, 32, 55, 'player');
    return true;
  }

  _animateWings(delta, isFlapping, isDiving, isFlaring, isPerched) {
    if (this.mixer) {
      this.mixer.update(delta);

      const targetAction = isPerched ? 'Idle' : (isFlapping ? 'Fly' : 'Glide');
      if (this.animations[targetAction] && this.currentAction !== this.animations[targetAction]) {
        if (this.currentAction) this.currentAction.fadeOut(0.2);
        this.currentAction = this.animations[targetAction];
        this.currentAction.reset().fadeIn(0.2).play();
      }
      return;
    }

    if (isPerched) {
      // Perched: Wings neatly folded against flanks, legs gripped to branch
      const tuckProgress = this.landingTimer; // 0 to 1
      const hopOffset = this.isHopping ? Math.sin(Date.now() * 0.02) * 0.15 : 0;

      this.leftWingRoot.rotation.set(
        THREE.MathUtils.lerp(0.04, 0.15, tuckProgress),
        THREE.MathUtils.lerp(0, 0.15, tuckProgress),
        THREE.MathUtils.lerp(0.1, 0.45 + hopOffset, tuckProgress)
      );
      this.rightWingRoot.rotation.set(
        THREE.MathUtils.lerp(0.04, 0.15, tuckProgress),
        THREE.MathUtils.lerp(0, -0.15, tuckProgress),
        THREE.MathUtils.lerp(-0.1, -0.45 - hopOffset, tuckProgress)
      );
      this.leftWingOuter.rotation.set(0, 0, 0.2);
      this.rightWingOuter.rotation.set(0, 0, -0.2);

      // Leg gripping pose
      this.legL.rotation.x = 0.25;
      this.legR.rotation.x = 0.25;
      return;
    }

    if (isFlapping) {
      const flapFrequency = 20;
      this.flapCycle += delta * flapFrequency;
      const flapAngle = Math.sin(this.flapCycle) * 0.75;
      const outerFlap = Math.sin(this.flapCycle - 0.3) * 0.55;
      this.leftWingRoot.rotation.z = flapAngle;
      this.rightWingRoot.rotation.z = -flapAngle;

      this.leftWingOuter.rotation.z = outerFlap;
      this.rightWingOuter.rotation.z = -outerFlap;

      this.leftWingRoot.rotation.y = Math.cos(this.flapCycle) * 0.18;
      this.rightWingRoot.rotation.y = -Math.cos(this.flapCycle) * 0.18;
    } else if (isDiving) {
      this.leftWingRoot.rotation.set(0.45, 0.35, 1.25);
      this.rightWingRoot.rotation.set(0.45, -0.35, -1.25);
      this.leftWingOuter.rotation.set(0, 0, 0.3);
      this.rightWingOuter.rotation.set(0, 0, -0.3);
      this.tail.rotation.x = 0.3;
    } else if (isFlaring) {
      this.leftWingRoot.rotation.set(-0.35, -0.3, -0.5);
      this.rightWingRoot.rotation.set(-0.35, 0.3, 0.5);
      this.leftWingOuter.rotation.set(0, 0, 0.4);
      this.rightWingOuter.rotation.set(0, 0, -0.4);
      this.tail.rotation.x = -0.5;
    } else {
      // Gliding
      this.wingAnimTime += delta * 2.5;
      const glideFlex = Math.sin(this.wingAnimTime) * 0.04;

      this.leftWingRoot.rotation.set(0.04, 0, 0.1 + glideFlex);
      this.rightWingRoot.rotation.set(0.04, 0, -0.1 - glideFlex);
      this.leftWingOuter.rotation.set(0, 0, 0.05);
      this.rightWingOuter.rotation.set(0, 0, -0.05);
      this.tail.rotation.x = -this.flightPitch * 0.35;
    }

    // Legs in flight
    this.legL.rotation.x = -1.1;
    this.legR.rotation.x = -1.1;
  }
}
