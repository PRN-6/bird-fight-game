import * as THREE from 'three';

export class EnemyBird extends THREE.Group {
  constructor(scene, startPos, type = 'hawk') {
    super();
    this.scene = scene;
    this.position.copy(startPos);
    this.type = type;

    // Stats
    this.maxHealth = type === 'owl' ? 180 : (type === 'hawk' ? 130 : 85);
    this.health = this.maxHealth;
    this.isDead = false;
    this.hitRadius = 2.0;
    this.speed = type === 'raven' ? 24 : 20;

    // AI States: 'patrol', 'chase', 'attack', 'retreat'
    this.aiState = 'patrol';
    this.patrolOrigin = startPos.clone();
    this.patrolRadius = 80;
    this.patrolTarget = new THREE.Vector3();
    this._pickNewPatrolTarget();

    this.attackCooldown = 0;
    this.attackRange = 45;
    this.velocity = new THREE.Vector3(0, 0, -this.speed);

    this.flapCycle = 0;

    this._buildModel();
    this._buildHealthBar();
    this.scene.add(this);
  }

  _buildModel() {
    this.modelRoot = new THREE.Group();
    // Large predator scale relative to the small songbird player!
    this.modelRoot.scale.set(0.95, 0.95, 0.95);
    this.add(this.modelRoot);

    let mainColor = 0x8b2500; // Hawk rust red
    let secondaryColor = 0x3d1a10;
    let eyeColor = 0xffa500;

    if (this.type === 'owl') {
      mainColor = 0x4a3c31; // Great Horned Owl mottled brown
      secondaryColor = 0x2e241c;
      eyeColor = 0xffd700; // Piercing gold eyes
    } else if (this.type === 'raven') {
      mainColor = 0x111827; // Midnight shadow crow
      secondaryColor = 0x030712;
      eyeColor = 0x93c5fd;
    }

    const mat = new THREE.MeshStandardMaterial({
      color: mainColor,
      roughness: 0.75,
      metalness: 0.1,
      flatShading: true
    });
    const secMat = new THREE.MeshStandardMaterial({
      color: secondaryColor,
      roughness: 0.8,
      flatShading: true
    });
    const beakMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });

    // Torso
    const bodyGeo = new THREE.ConeGeometry(0.5, 2.2, 7);
    bodyGeo.rotateX(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.castShadow = true;
    this.modelRoot.add(body);

    // Head
    const head = new THREE.Group();
    head.position.set(0, 0.3, -1.1);
    const headMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.36, 1), secMat);
    head.add(headMesh);

    // Owl Horn Tufts if owl
    if (this.type === 'owl') {
      const tuftGeo = new THREE.ConeGeometry(0.1, 0.35, 4);
      const tuftL = new THREE.Mesh(tuftGeo, secMat);
      tuftL.position.set(0.2, 0.32, -0.05);
      tuftL.rotation.z = -0.3;
      const tuftR = tuftL.clone();
      tuftR.position.x = -0.2;
      tuftR.rotation.z = 0.3;
      head.add(tuftL, tuftR);
    }

    // Hooked Predator Beak
    const beakGeo = new THREE.ConeGeometry(0.14, 0.5, 4);
    beakGeo.rotateX(-Math.PI / 2);
    beakGeo.rotateX(0.35);
    const beakMesh = new THREE.Mesh(beakGeo, beakMat);
    beakMesh.position.set(0, -0.08, -0.42);
    head.add(beakMesh);

    // Predator Glowing Eyes
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.065, 4, 4), eyeMat);
    eyeL.position.set(0.22, 0.1, -0.18);
    const eyeR = eyeL.clone();
    eyeR.position.x = -0.22;
    head.add(eyeL, eyeR);
    this.modelRoot.add(head);

    // Large Predator Wings
    this.leftWing = new THREE.Group();
    this.leftWing.position.set(0.4, 0.15, -0.3);
    const wingGeo = new THREE.BoxGeometry(1.9, 0.06, 0.7);
    const wingMeshL = new THREE.Mesh(wingGeo, mat);
    wingMeshL.position.set(0.95, 0, 0);
    wingMeshL.castShadow = true;
    this.leftWing.add(wingMeshL);
    this.modelRoot.add(this.leftWing);

    this.rightWing = new THREE.Group();
    this.rightWing.position.set(-0.4, 0.15, -0.3);
    const wingMeshR = new THREE.Mesh(wingGeo, mat);
    wingMeshR.position.set(-0.95, 0, 0);
    wingMeshR.castShadow = true;
    this.rightWing.add(wingMeshR);
    this.modelRoot.add(this.rightWing);

    // Tail Fan
    const tailGeo = new THREE.BoxGeometry(1.0, 0.05, 0.9);
    const tailMesh = new THREE.Mesh(tailGeo, secMat);
    tailMesh.position.set(0, 0.1, 1.4);
    tailMesh.castShadow = true;
    this.modelRoot.add(tailMesh);
  }

  _buildHealthBar() {
    // 3D Billboard Health Bar
    const bgGeo = new THREE.PlaneGeometry(1.8, 0.2);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x1e293b, side: THREE.DoubleSide });
    this.hpBg = new THREE.Mesh(bgGeo, bgMat);
    this.hpBg.position.set(0, 1.6, 0);

    const fillGeo = new THREE.PlaneGeometry(1.7, 0.15);
    const fillMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide });
    this.hpFill = new THREE.Mesh(fillGeo, fillMat);
    this.hpFill.position.set(0, 0, 0.01);
    this.hpBg.add(this.hpFill);

    this.add(this.hpBg);
  }

  _pickNewPatrolTarget() {
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * this.patrolRadius;
    const alt = 45 + Math.random() * 55;
    this.patrolTarget.set(
      this.patrolOrigin.x + Math.cos(angle) * dist,
      alt,
      this.patrolOrigin.z + Math.sin(angle) * dist
    );
  }

  takeDamage(amount, attacker) {
    if (this.isDead) return;
    this.health -= amount;
    this.aiState = 'chase';

    const pct = Math.max(0, this.health / this.maxHealth);
    this.hpFill.scale.x = pct;
    this.hpFill.position.x = -(1 - pct) * 0.85;

    if (this.health <= 0) {
      this.die(attacker);
    }
  }

  die(attacker) {
    this.isDead = true;
    this.scene.remove(this);

    if (attacker && attacker.inventory) {
      attacker.inventory.feathers = (attacker.inventory.feathers || 0) + 3;
      attacker.inventory.pebbles = (attacker.inventory.pebbles || 0) + 2;
      attacker.inventory.berries = (attacker.inventory.berries || 0) + 2;
      if (window.onResourceCollected) {
        window.onResourceCollected('FOREST TRIUMPH (Feathers + Acorns)', attacker.inventory);
      }
    }
  }

  update(delta, player, combatSystem, camera) {
    if (this.isDead) return;

    if (camera) {
      this.hpBg.quaternion.copy(camera.quaternion);
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - delta);

    const distToPlayer = this.position.distanceTo(player.position);

    if (distToPlayer < 75 && !player.isGrounded) {
      this.aiState = 'chase';
    } else if (distToPlayer > 120) {
      this.aiState = 'patrol';
    }

    let targetPoint = this.patrolTarget;
    if (this.aiState === 'chase') {
      targetPoint = player.position.clone().add(new THREE.Vector3(0, 0.8, 0));

      if (distToPlayer < this.attackRange && this.attackCooldown <= 0) {
        this.attackCooldown = 2.5;
        const shootDir = player.position.clone().sub(this.position).normalize();
        combatSystem.spawnWindBlade(this.position, shootDir, 16, 'enemy');
      }
    } else {
      if (this.position.distanceTo(this.patrolTarget) < 15) {
        this._pickNewPatrolTarget();
      }
    }

    const desiredDir = targetPoint.clone().sub(this.position).normalize();
    const targetQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), desiredDir);
    this.quaternion.slerp(targetQuat, delta * 2.5);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
    this.velocity.copy(forward).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, delta);

    this.flapCycle += delta * 10;
    const flap = Math.sin(this.flapCycle) * 0.55;
    this.leftWing.rotation.z = flap;
    this.rightWing.rotation.z = -flap;
  }
}
