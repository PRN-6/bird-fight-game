import * as THREE from 'three';

export class RemoteBird extends THREE.Group {
  constructor(scene, peerId, name = 'Skylord', birdColor = 0x2288dd) {
    super();
    this.scene = scene;
    this.peerId = peerId;
    this.name = name;
    this.birdColor = birdColor;

    this.maxHealth = 100;
    this.health = 100;
    this.isDead = false;
    this.hitRadius = 1.4;

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
    this.add(this.modelRoot);

    const featherMat = new THREE.MeshStandardMaterial({
      color: this.birdColor,
      roughness: 0.7,
      metalness: 0.1,
      flatShading: true
    });
    const secondaryMat = new THREE.MeshStandardMaterial({
      color: 0x1a2b3c,
      roughness: 0.8,
      flatShading: true
    });
    const beakMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.3 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00f2ff });

    // Torso
    const bodyGeo = new THREE.ConeGeometry(0.38, 1.8, 8);
    bodyGeo.rotateX(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, featherMat);
    body.castShadow = true;
    this.modelRoot.add(body);

    // Head
    const head = new THREE.Group();
    head.position.set(0, 0.22, -0.9);
    const headMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 1), secondaryMat);
    head.add(headMesh);

    // Beak
    const beakGeo = new THREE.ConeGeometry(0.12, 0.4, 4);
    beakGeo.rotateX(-Math.PI / 2);
    beakGeo.rotateX(0.2);
    const beakMesh = new THREE.Mesh(beakGeo, beakMat);
    beakMesh.position.set(0, -0.06, -0.35);
    head.add(beakMesh);

    // Eyes
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), eyeMat);
    eyeL.position.set(0.18, 0.08, -0.15);
    const eyeR = eyeL.clone();
    eyeR.position.x = -0.18;
    head.add(eyeL, eyeR);
    this.modelRoot.add(head);

    // Wings
    this.leftWing = new THREE.Group();
    this.leftWing.position.set(0.3, 0.1, -0.2);
    const wingGeo = new THREE.BoxGeometry(1.6, 0.05, 0.55);
    const wingMeshL = new THREE.Mesh(wingGeo, featherMat);
    wingMeshL.position.set(0.8, 0, 0);
    this.leftWing.add(wingMeshL);
    this.modelRoot.add(this.leftWing);

    this.rightWing = new THREE.Group();
    this.rightWing.position.set(-0.3, 0.1, -0.2);
    const wingMeshR = new THREE.Mesh(wingGeo, featherMat);
    wingMeshR.position.set(-0.8, 0, 0);
    this.rightWing.add(wingMeshR);
    this.modelRoot.add(this.rightWing);

    // Tail
    const tailGeo = new THREE.BoxGeometry(0.9, 0.04, 0.8);
    const tailMesh = new THREE.Mesh(tailGeo, secondaryMat);
    tailMesh.position.set(0, 0.08, 1.2);
    this.modelRoot.add(tailMesh);
  }

  _buildNameTagAndHP() {
    // 3D Billboard Name & HP bar
    this.uiGroup = new THREE.Group();
    this.uiGroup.position.set(0, 1.5, 0);

    const bgGeo = new THREE.PlaneGeometry(1.6, 0.16);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x0f172a, side: THREE.DoubleSide });
    const hpBg = new THREE.Mesh(bgGeo, bgMat);
    this.uiGroup.add(hpBg);

    const fillGeo = new THREE.PlaneGeometry(1.5, 0.12);
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
    this.hpFill.position.x = -(1 - pct) * 0.75;
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
      this.hpFill.position.x = -(1 - pct) * 0.75;
    }
  }

  update(delta, camera) {
    if (camera) {
      this.uiGroup.quaternion.copy(camera.quaternion);
    }

    // Smooth network position & orientation interpolation (Hermite/Lerp)
    this.position.lerp(this.targetPos, delta * 14.0);
    this.quaternion.slerp(this.targetQuat, delta * 14.0);

    // Wing flapping animation
    if (this.isFlapping) {
      this.flapCycle += delta * 14;
      const flap = Math.sin(this.flapCycle) * 0.65;
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
