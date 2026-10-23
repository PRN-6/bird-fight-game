import * as THREE from 'three';

export class RemoteBird extends THREE.Group {
  constructor(scene, peerId, name = 'ForestFinch', birdColor = 0x22c55e) {
    super();
    this.scene = scene;
    this.peerId = peerId;
    this.name = name;
    this.birdColor = birdColor;

    this.maxHealth = 100;
    this.health = 100;
    this.isDead = false;
    this.hitRadius = 1.0;

    // Network interpolation targets
    this.targetPos = new THREE.Vector3();
    this.targetQuat = new THREE.Quaternion();
    this.isFlapping = false;
    this.isDiving = false;
    this.isFlaring = false;
    this.flapCycle = 0;

    this._buildModel();
    this._buildNameTagAndHP();
    this.scene.add(this);
  }

  _buildModel() {
    this.modelRoot = new THREE.Group();
    this.modelRoot.scale.set(0.38, 0.38, 0.38);
    this.add(this.modelRoot);

    const featherMat = new THREE.MeshStandardMaterial({
      color: this.birdColor,
      roughness: 0.65,
      metalness: 0.15,
      flatShading: true
    });
    const secondaryMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.8,
      flatShading: true
    });
    const bellyMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      roughness: 0.85,
      flatShading: true
    });
    const beakMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00f2ff });

    // Torso
    const bodyGeo = new THREE.SphereGeometry(0.55, 8, 8);
    bodyGeo.scale(0.85, 0.9, 1.4);
    const body = new THREE.Mesh(bodyGeo, featherMat);
    body.castShadow = true;
    this.modelRoot.add(body);

    const bellyGeo = new THREE.SphereGeometry(0.44, 7, 7);
    bellyGeo.scale(0.75, 0.7, 1.1);
    const belly = new THREE.Mesh(bellyGeo, bellyMat);
    belly.position.set(0, -0.15, 0.2);
    this.modelRoot.add(belly);

    // Head
    const head = new THREE.Group();
    head.position.set(0, 0.32, -0.65);
    const headGeo = new THREE.SphereGeometry(0.38, 8, 8);
    headGeo.scale(0.95, 1.0, 1.05);
    const headMesh = new THREE.Mesh(headGeo, featherMat);
    head.add(headMesh);

    // Beak
    const beakGeo = new THREE.ConeGeometry(0.1, 0.38, 5);
    beakGeo.rotateX(-Math.PI / 2);
    const beakMesh = new THREE.Mesh(beakGeo, beakMat);
    beakMesh.position.set(0, -0.04, -0.42);
    head.add(beakMesh);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.08, 6, 6);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(0.25, 0.1, -0.12);
    const eyeR = eyeL.clone();
    eyeR.position.x = -0.25;
    head.add(eyeL, eyeR);
    this.modelRoot.add(head);

    // Wings
    this.leftWing = new THREE.Group();
    this.leftWing.position.set(0.35, 0.12, -0.15);
    const wingGeo = new THREE.BoxGeometry(1.6, 0.04, 0.45);
    const wingMeshL = new THREE.Mesh(wingGeo, featherMat);
    wingMeshL.position.set(0.8, 0, 0);
    this.leftWing.add(wingMeshL);
    this.modelRoot.add(this.leftWing);

    this.rightWing = new THREE.Group();
    this.rightWing.position.set(-0.35, 0.12, -0.15);
    const wingMeshR = new THREE.Mesh(wingGeo, featherMat);
    wingMeshR.position.set(-0.8, 0, 0);
    this.rightWing.add(wingMeshR);
    this.modelRoot.add(this.rightWing);

    // Tail
    const tailGeo = new THREE.BoxGeometry(0.7, 0.03, 0.95);
    const tailMesh = new THREE.Mesh(tailGeo, secondaryMat);
    tailMesh.position.set(0, 0.05, 0.85);
    this.modelRoot.add(tailMesh);
  }

  _buildNameTagAndHP() {
    this.uiGroup = new THREE.Group();
    this.uiGroup.position.set(0, 0.85, 0);

    const bgGeo = new THREE.PlaneGeometry(1.2, 0.12);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x0f172a, side: THREE.DoubleSide });
    const hpBg = new THREE.Mesh(bgGeo, bgMat);
    this.uiGroup.add(hpBg);

    const fillGeo = new THREE.PlaneGeometry(1.1, 0.09);
    const fillMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide });
    this.hpFill = new THREE.Mesh(fillGeo, fillMat);
    this.hpFill.position.set(0, 0, 0.01);
    this.uiGroup.add(this.hpFill);

    this.add(this.uiGroup);
  }

  takeDamage(amount, attacker) {
    this.health = Math.max(0, this.health - amount);
    const pct = Math.max(0, this.health / this.maxHealth);
    this.hpFill.scale.x = pct;
    this.hpFill.position.x = -(1 - pct) * 0.55;
  }

  setNetworkState(data) {
    if (data.pos) this.targetPos.set(data.pos[0], data.pos[1], data.pos[2]);
    if (data.quat) this.targetQuat.set(data.quat[0], data.quat[1], data.quat[2], data.quat[3]);
    this.isFlapping = !!data.flap;
    this.isDiving = !!data.dive;
    this.isFlaring = !!data.flare;
    if (data.hp !== undefined) {
      this.health = data.hp;
      const pct = Math.max(0, this.health / this.maxHealth);
      this.hpFill.scale.x = pct;
      this.hpFill.position.x = -(1 - pct) * 0.55;
    }
  }

  update(delta, ...args) {
    const cam = args.find(a => a && a.isCamera) || (args[0] && args[0].isCamera ? args[0] : null);
    if (cam && this.uiGroup) {
      this.uiGroup.quaternion.copy(cam.quaternion);
    }

    this.position.lerp(this.targetPos, delta * 14.0);
    this.quaternion.slerp(this.targetQuat, delta * 14.0);

    if (this.isFlapping) {
      this.flapCycle += delta * 18;
      const flap = Math.sin(this.flapCycle) * 0.7;
      this.leftWing.rotation.z = flap;
      this.rightWing.rotation.z = -flap;
    } else if (this.isDiving) {
      this.leftWing.rotation.set(0.4, 0.4, 1.2);
      this.rightWing.rotation.set(0.4, -0.4, -1.2);
    } else {
      this.leftWing.rotation.set(0.04, 0, 0.1);
      this.rightWing.rotation.set(0.04, 0, -0.1);
    }
  }

  destroy() {
    this.scene.remove(this);
  }
}
