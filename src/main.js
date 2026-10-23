import * as THREE from 'three';
import { Bird } from './entities/Bird.js';
import { World } from './world/World.js';
import { SoundFX } from './audio/SoundFX.js';
import { HUD } from './ui/HUD.js';
import { CombatSystem } from './combat/CombatSystem.js';
import { NetworkManager } from './network/NetworkManager.js';

class Game {
  constructor() {
    this.container = document.getElementById('game-container');
    this.clock = new THREE.Clock();

    // Input States
    this.input = {
      pitch: 0,
      roll: 0,
      yaw: 0,
      flap: false,
      dive: false,
      brake: false,
      up: false
    };

    // Camera Modes: 'chase', 'cockpit', 'orbit'
    this.cameraMode = 'chase';
    this.cameraOffset = new THREE.Vector3(0, 2.5, 7.5);
    this.currentCamPos = new THREE.Vector3();
    this.currentCamLook = new THREE.Vector3();

    // Mouse Flight Controller & Flight Options
    this.mouseControlActive = false;
    this.invertPitch = false;
    this.mouse = { x: 0, y: 0 };

    // Network Manager (Multiplayer)
    this.network = new NetworkManager(this);

    this._initThree();
    this._initScene();
    this._initListeners();
    this._initMultiplayerUI();
    this._animate();
  }

  _initThree() {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.appendChild(this.renderer.domElement);

    // Scene & Deep Enchanted Forest Atmosphere Fog (tuned for expansive 3.6km panoramic views)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e281b);
    this.scene.fog = new THREE.FogExp2(0x133825, 0.0012);

    // Camera with closer near-plane and deep 4500m far-plane for expansive forest exploration
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 4500);
  }

  _initScene() {
    // Sun & Canopy Lighting
    this.ambientLight = new THREE.AmbientLight(0xdcfce7, 0.6);
    this.scene.add(this.ambientLight);

    // Warm Sunbeam Directional Light
    this.sunLight = new THREE.DirectionalLight(0xfff0d0, 1.85);
    this.sunLight.position.set(150, 320, 180);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 900;
    const d = 220;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);

    // Hemisphere Light for lush woodland greens & earth shadows
    const hemiLight = new THREE.HemisphereLight(0x86efac, 0x1c2b19, 0.6);
    this.scene.add(hemiLight);

    // Audio synthesizer
    this.sound = new SoundFX();

    // Combat System
    this.combat = new CombatSystem(this.scene);

    // Enchanted World & Giant Forest
    this.world = new World(this.scene);

    // Small Forest Bird Entity
    this.bird = new Bird();
    this.bird.position.copy(this.world.getNestStandPosition());
    this.bird.isGrounded = true; // Safe perching inside the Great Tree nest
    this.scene.add(this.bird);

    // HUD Instruments
    this.hud = new HUD(this.bird, this.world);

    // Notification callback for resource collection
    window.onResourceCollected = (type, inv) => {
      this.sound.playPickup();
      this._showPickupToast(`Collected +1 ${type.toUpperCase()}`);

      // Broadcast resource collection to peers if multiplayer
      if (this.network && this.network.connections.size > 0) {
        const resIndex = this.world.resources.findIndex(r => r.type === type && r.collected);
        if (resIndex >= 0) {
          this.network.broadcast({ type: 'RESOURCE_COLLECTED', index: resIndex });
        }
      }
    };

    // Bark / branch impact feedback
    window.onBirdImpact = (pos, damage, normal) => {
      this.combat.spawnHitParticles(pos, 0x8b5a2b, 10);
      this.sound.playHitImpact();
      if (damage >= 6) {
        this._showPickupToast(`💥 Bark Impact! -${Math.round(damage)} HP`);
      }
    };

    // Perch / touchdown feedback
    window.onBirdLanded = (onBranch) => {
      this.sound.playFlap();
      this._showPickupToast(onBranch ? '🌿 Perched safely on a branch' : '🍃 Landed on the forest floor');
    };
  }

  _initMultiplayerUI() {
    // Solo Play Button
    const soloBtn = document.getElementById('btn-play-solo');
    if (soloBtn) {
      soloBtn.addEventListener('click', () => {
        this.sound.init();
        this._dismissStartOverlay();
        this._showPickupToast('🦅 Solo Flight Mode — Explore the open skies!');
      });
    }

    // Create Room (Host) Button
    const createBtn = document.getElementById('btn-create-room');
    const hostCodeDisplay = document.getElementById('host-code-display');
    const displayRoomId = document.getElementById('display-room-id');
    const roomBadge = document.getElementById('btn-room-badge');

    if (createBtn) {
      createBtn.addEventListener('click', () => {
        this.sound.init();
        createBtn.textContent = '⏳ Creating...';
        createBtn.disabled = true;

        this.network.createRoom(null, (roomId) => {
          // Room created successfully
          if (hostCodeDisplay) hostCodeDisplay.style.display = 'flex';
          if (displayRoomId) displayRoomId.textContent = roomId;
          createBtn.textContent = '✅ Room Live!';
          if (roomBadge) roomBadge.textContent = `🌐 Room: ${roomId}`;

          this._showPickupToast(`🌐 Sky Room Created: ${roomId} — Share with friends!`);

          // Auto-dismiss start overlay after a brief moment
          setTimeout(() => this._dismissStartOverlay(), 1500);
        });
      });
    }

    // Copy Invite Link Button
    const copyBtn = document.getElementById('btn-copy-link');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const roomId = this.network.roomId || 'SKY-????';
        const link = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
        navigator.clipboard.writeText(link).then(() => {
          copyBtn.textContent = '✅ Copied!';
          setTimeout(() => (copyBtn.textContent = '📋 Copy Link'), 2000);
          this._showPickupToast('📋 Invite link copied to clipboard!');
        }).catch(() => {
          // Fallback: copy just the room code
          navigator.clipboard.writeText(roomId).catch(() => {});
          copyBtn.textContent = '✅ Code Copied!';
          setTimeout(() => (copyBtn.textContent = '📋 Copy Link'), 2000);
        });
      });
    }

    // Join Room Button
    const joinBtn = document.getElementById('btn-join-room');
    const roomInput = document.getElementById('input-room-code');

    if (joinBtn && roomInput) {
      const doJoin = () => {
        const code = roomInput.value.trim().toUpperCase();
        if (!code) {
          this._showPickupToast('⚠️ Enter a room code first!');
          return;
        }
        this.sound.init();
        joinBtn.textContent = '⏳ Joining...';
        joinBtn.disabled = true;

        this.network.joinRoom(code,
          (roomId) => {
            // Connected successfully
            joinBtn.textContent = '✅ Connected!';
            if (roomBadge) roomBadge.textContent = `🌐 Room: ${roomId}`;
            this._showPickupToast(`🌐 Joined Sky Room: ${roomId}!`);
            setTimeout(() => this._dismissStartOverlay(), 800);
          },
          (err) => {
            // Connection error
            joinBtn.textContent = 'JOIN';
            joinBtn.disabled = false;
            this._showPickupToast(`❌ Failed to join: ${err.type || 'Unknown error'}`);
          }
        );
      };

      joinBtn.addEventListener('click', doJoin);
      roomInput.addEventListener('keydown', (e) => {
        if (e.code === 'Enter') doJoin();
      });
    }

    // Auto-join if URL contains ?room=SKY-XXXX
    const urlParams = new URLSearchParams(window.location.search);
    const autoJoinRoom = urlParams.get('room');
    if (autoJoinRoom && roomInput) {
      roomInput.value = autoJoinRoom;
      this._showPickupToast(`🔗 Auto-joining room: ${autoJoinRoom}...`);
      setTimeout(() => {
        if (joinBtn) joinBtn.click();
      }, 800);
    }
  }

  _dismissStartOverlay() {
    const startModal = document.getElementById('start-overlay');
    if (startModal) {
      startModal.style.opacity = '0';
      startModal.style.pointerEvents = 'none';
      setTimeout(() => (startModal.style.display = 'none'), 500);
    }
  }

  _initListeners() {
    window.addEventListener('resize', () => this._onResize());

    // Keyboard Flight & Combat Controls
    const keysDown = {};

    window.addEventListener('keydown', (e) => {
      keysDown[e.code] = true;
      this.sound.init(); // Initialize Web Audio on first user interaction

      if (e.code === 'Space') {
        this.input.flap = true;
        this.sound.playFlap();
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.input.dive = true;
      }
      if (e.code === 'KeyF') {
        // Attack 1: Talon Melee Strike
        this.bird.performTalonStrike(this.combat, this.sound, this.world.enemies);
      }
      if (e.code === 'KeyE') {
        // Attack 2: Wind Blade Projectile
        const fired = this.bird.performWindBlade(this.combat, this.sound);
        if (fired && this.network.connections.size > 0) {
          const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.bird.quaternion);
          const spawnPos = this.bird.position.clone().add(fwd.clone().multiplyScalar(2.0));
          this.network.broadcastAttack('ATTACK_WINDBLADE', {
            pos: [spawnPos.x, spawnPos.y, spawnPos.z],
            dir: [fwd.x, fwd.y, fwd.z],
            dmg: 40
          });
        }
      }
      if (e.code === 'KeyQ') {
        // Attack 3: Sonic Screech AoE Shockwave
        const fired = this.bird.performSonicShockwave(this.combat, this.sound);
        if (fired && this.network.connections.size > 0) {
          this.network.broadcastAttack('ATTACK_SHOCKWAVE', {
            pos: [this.bird.position.x, this.bird.position.y, this.bird.position.z],
            radius: 35,
            dmg: 60
          });
        }
      }
      if (e.code === 'KeyB') {
        // Deposit Collected Materials & Upgrade Nest
        this.depositNestMaterials();
      }
      if (e.code === 'KeyC') {
        this.sound.playEagleCry();
        this._showPickupToast('🎶 Melodious Songbird Warble!');
      }
      if (e.code === 'KeyV') {
        this._cycleCamera();
      }
      if (e.code === 'KeyL') {
        // Land on the branch / forest floor below, or take off again
        const mode = this.bird.toggleLanding();
        if (mode === 'land') {
          this._showPickupToast('🪶 Swooping down to perch… (press L again to cancel)');
        } else if (mode === 'takeoff') {
          this._showPickupToast('🕊️ Flapping back into flight!');
        } else {
          this._showPickupToast('✈️ Landing cancelled');
        }
      }
      if (e.code === 'KeyM') {
        const isMuted = this.sound.toggleMute();
        this._showPickupToast(isMuted ? '🔇 Audio Muted' : '🔊 Audio Active');
      }
      if (e.code === 'KeyR') {
        // Reset flight position to Great Tree nest
        this.bird.position.copy(this.world.getNestStandPosition());
        this.bird.velocity.set(0, 0, 0);
        this.bird.quaternion.identity();
        this.bird.isGrounded = true;
        this.bird.wantsLanding = false;
        this.bird.stamina = this.bird.maxStamina;
        this.bird.health = this.bird.maxHealth;
        this._showPickupToast('🪺 Repositioned to Great Tree Nest');
      }

      this._updateKeyboardInput(keysDown);
    });

    window.addEventListener('keyup', (e) => {
      keysDown[e.code] = false;
      if (e.code === 'Space') this.input.flap = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.input.dive = false;
      this._updateKeyboardInput(keysDown);
    });

    // Mouse Attack Click Listeners
    window.addEventListener('mousedown', (e) => {
      this.sound.init();
      if (e.target.closest('button') || e.target.closest('.ability-slot') || e.target.closest('input')) return;
      if (e.button === 0) {
        // Left Click: Talon Strike
        this.bird.performTalonStrike(this.combat, this.sound, this.world.enemies);
      } else if (e.button === 2) {
        // Right Click: Wind Blade
        this.bird.performWindBlade(this.combat, this.sound);
      }
    });

    // Prevent default context menu on right click for attack firing
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.bird.performWindBlade(this.combat, this.sound);
    });

    // Hotbar click events
    const slotTalon = document.getElementById('ability-talon');
    if (slotTalon) {
      slotTalon.addEventListener('click', () => this.bird.performTalonStrike(this.combat, this.sound, this.world.enemies));
    }
    const slotWind = document.getElementById('ability-wind');
    if (slotWind) {
      slotWind.addEventListener('click', () => this.bird.performWindBlade(this.combat, this.sound));
    }
    const slotShockwave = document.getElementById('ability-shockwave');
    if (slotShockwave) {
      slotShockwave.addEventListener('click', () => this.bird.performSonicShockwave(this.combat, this.sound));
    }

    // Mouse Steering (Optional smooth flight cursor)
    window.addEventListener('mousemove', (e) => {
      if (this.mouseControlActive) {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      }
    });

    // Toggle mouse steering button
    const toggleMouseBtn = document.getElementById('btn-toggle-mouse');
    if (toggleMouseBtn) {
      toggleMouseBtn.addEventListener('click', () => {
        this.mouseControlActive = !this.mouseControlActive;
        toggleMouseBtn.textContent = this.mouseControlActive ? '🖱️ Mouse Flight: ON' : '🖱️ Mouse Flight: OFF';
        toggleMouseBtn.classList.toggle('active', this.mouseControlActive);
        this._showPickupToast(this.mouseControlActive ? '🖱️ Mouse Flight ON (Move cursor to steer)' : '⌨️ Keyboard Flight ON');
      });
    }

    // Toggle Invert Pitch button
    const toggleInvertBtn = document.getElementById('btn-toggle-invert');
    if (toggleInvertBtn) {
      toggleInvertBtn.addEventListener('click', () => {
        this.invertPitch = !this.invertPitch;
        toggleInvertBtn.textContent = this.invertPitch ? '↕️ Invert Pitch: ON' : '↕️ Invert Pitch: OFF';
        toggleInvertBtn.classList.toggle('active', this.invertPitch);
        this._showPickupToast(this.invertPitch ? '↕️ Invert Pitch ON (W climbs, S dives)' : '↕️ Normal Flight (W dives, S climbs)');
      });
    }

    // Flap button for touch / click
    const flapBtn = document.getElementById('btn-flap');
    if (flapBtn) {
      flapBtn.addEventListener('mousedown', () => {
        this.sound.init();
        this.input.flap = true;
        this.sound.playFlap();
      });
      flapBtn.addEventListener('mouseup', () => {
        this.input.flap = false;
      });
    }

    // Nest Upgrade Button listeners
    const btnUpgradeNest = document.getElementById('btn-upgrade-nest');
    if (btnUpgradeNest) {
      btnUpgradeNest.addEventListener('click', () => this.depositNestMaterials());
    }
    const btnDepositPrompt = document.getElementById('btn-deposit-prompt');
    if (btnDepositPrompt) {
      btnDepositPrompt.addEventListener('click', () => this.depositNestMaterials());
    }

    // Controls Guide Drawer toggle
    const toggleControlsBtn = document.getElementById('btn-toggle-controls');
    const closeControlsBtn = document.getElementById('btn-close-controls');
    const controlsPanel = document.getElementById('hud-controls-panel');

    const toggleControls = () => {
      if (controlsPanel) {
        controlsPanel.classList.toggle('hidden');
      }
    };

    if (toggleControlsBtn) toggleControlsBtn.addEventListener('click', toggleControls);
    if (closeControlsBtn) closeControlsBtn.addEventListener('click', toggleControls);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyH') {
        toggleControls();
      }
    });
  }

  depositNestMaterials() {
    this.sound.init();
    if (!this.world || !this.bird) return;

    // Check distance to Nest
    const distToNest = this.bird.position.distanceTo(this.world.nestSite.position);
    if (distToNest > 20.0) {
      this._showPickupToast('📍 Fly closer to the Great Tree Nest to deposit materials!');
      return;
    }

    const result = this.world.depositMaterialsToNest(this.bird);
    if (result.success) {
      this.sound.playPickup();
      this.combat.spawnHitParticles(this.world.nestSite.position, 0xffd166, 30);
      this._showPickupToast(result.message);
    } else {
      this._showPickupToast(`⚠️ ${result.message}`);
    }
  }

  _updateKeyboardInput(keys) {
    // Pitch: W/Up (Pitch Down), S/Down (Pitch Up)
    let p = 0;
    if (keys['KeyW'] || keys['ArrowUp']) p += (this.invertPitch ? -1.0 : 1.0);
    if (keys['KeyS'] || keys['ArrowDown']) p += (this.invertPitch ? 1.0 : -1.0);

    // Roll: A/Left (Bank Left), D/Right (Bank Right)
    let r = 0;
    if (keys['KeyA'] || keys['ArrowLeft']) r += 1.0;
    if (keys['KeyD'] || keys['ArrowRight']) r -= 1.0;

    // Yaw: Q (Rudder Left), E (Rudder Right)
    let y = 0;
    if (keys['KeyQ']) y += 1.0;
    if (keys['KeyE']) y -= 1.0;

    // Airbrake: Control / S when gliding
    this.input.brake = !!(keys['ControlLeft'] || keys['ControlRight']);

    if (this.mouseControlActive) {
      // Blend mouse control
      p += (this.invertPitch ? -1 : 1) * (-this.mouse.y * 1.5);
      r -= this.mouse.x * 1.8;
    }

    this.input.pitch = THREE.MathUtils.clamp(p, -1, 1);
    this.input.roll = THREE.MathUtils.clamp(r, -1, 1);
    this.input.yaw = THREE.MathUtils.clamp(y, -1, 1);
  }

  _cycleCamera() {
    const modes = ['chase', 'cockpit', 'orbit'];
    const nextIdx = (modes.indexOf(this.cameraMode) + 1) % modes.length;
    this.cameraMode = modes[nextIdx];
    this._showPickupToast(`🎥 Camera: ${this.cameraMode.toUpperCase()}`);
  }

  _showPickupToast(text) {
    const toast = document.getElementById('hud-toast');
    if (toast) {
      toast.textContent = text;
      toast.classList.add('show');
      clearTimeout(this.toastTimeout);
      this.toastTimeout = setTimeout(() => toast.classList.remove('show'), 2200);
    }
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _updateCamera(delta) {
    const birdPos = this.bird.position;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.bird.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.bird.quaternion);

    // Dynamic FOV stretching during high-speed dives
    const speed = this.bird.aerodynamics.airspeed;
    const targetFov = 65 + THREE.MathUtils.clamp((speed - 9) * 1.6, 0, 30);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, delta * 4.0);
    this.camera.updateProjectionMatrix();

    if (this.cameraMode === 'chase') {
      // Intimate close chase camera for small bird (dwarfed by massive trees & branches)
      const camDist = 3.2 + Math.min(2.2, speed * 0.14);
      const camHeight = 0.95;

      const idealOffset = forward.clone().multiplyScalar(-camDist).add(new THREE.Vector3(0, camHeight, 0));
      const targetCamPos = birdPos.clone().add(idealOffset);

      // Subtle camera vibration at extreme speeds
      if (speed > 18) {
        const shake = (speed - 18) * 0.014;
        targetCamPos.x += (Math.random() - 0.5) * shake;
        targetCamPos.y += (Math.random() - 0.5) * shake;
      }

      this.currentCamPos.lerp(targetCamPos, delta * 7.5);
      const targetLook = birdPos.clone().add(forward.clone().multiplyScalar(5.5));
      this.currentCamLook.lerp(targetLook, delta * 9.0);

      this.camera.position.copy(this.currentCamPos);
      this.camera.lookAt(this.currentCamLook);

    } else if (this.cameraMode === 'cockpit') {
      // First person songbird beak camera
      const headPos = birdPos.clone().add(new THREE.Vector3(0, 0.15, -0.22).applyQuaternion(this.bird.quaternion));
      this.camera.position.copy(headPos);
      const lookTarget = headPos.clone().add(forward.clone().multiplyScalar(30));
      this.camera.lookAt(lookTarget);

    } else if (this.cameraMode === 'orbit') {
      // Cinematic slow orbit
      const time = Date.now() * 0.0006;
      this.camera.position.set(
        birdPos.x + Math.sin(time) * 5.5,
        birdPos.y + 2.0,
        birdPos.z + Math.cos(time) * 5.5
      );
      this.camera.lookAt(birdPos);
    }
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const delta = Math.min(this.clock.getDelta(), 0.1);

    // Update Bird Entity & Aerodynamics
    this.bird.update(delta, this.input, this.world);

    // Update World & AI Enemies
    this.world.update(delta, this.bird, this.combat, this.camera);

    // Update Combat System (Projectiles, Shockwaves, Damage numbers)
    this.combat.update(delta, this.bird, this.world.enemies, this.camera);

    // Update Multiplayer Network (send position, receive remote birds)
    this.network.update(delta, this.bird);

    // Update Audio Synthesizer
    this.sound.update(this.bird.aerodynamics.airspeed, this.bird.aerodynamics.isTucking, this.bird.aerodynamics.inUpdraft);

    // Update HUD & Instruments
    this.hud.update(delta);

    // Update Dynamic Chase Camera
    this._updateCamera(delta);

    // Sync sunlight shadow center with bird position
    this.sunLight.position.set(this.bird.position.x + 150, 300, this.bird.position.z + 200);
    this.sunLight.target = this.bird;

    this.renderer.render(this.scene, this.camera);
  }
}

// Start Game on page load
window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
