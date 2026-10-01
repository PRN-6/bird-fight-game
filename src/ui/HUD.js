export class HUD {
  constructor(bird, world) {
    this.bird = bird;
    this.world = world;

    this._cacheDOMElements();
  }

  _cacheDOMElements() {
    this.speedValue = document.getElementById('hud-speed-val');
    this.speedUnit = document.getElementById('hud-speed-unit');
    this.altValue = document.getElementById('hud-alt-val');
    this.groundAlt = document.getElementById('hud-ground-alt');
    this.aoaValue = document.getElementById('hud-aoa-val');
    this.gForceValue = document.getElementById('hud-gforce-val');
    this.staminaFill = document.getElementById('hud-stamina-fill');
    this.staminaVal = document.getElementById('hud-stamina-text');
    this.healthFill = document.getElementById('hud-health-fill');
    this.healthVal = document.getElementById('hud-health-text');
    this.stallWarning = document.getElementById('hud-stall-alert');
    this.thermalIndicator = document.getElementById('hud-thermal-alert');
    this.flightStateBadge = document.getElementById('hud-state-badge');

    // Combat Cooldowns
    this.cdTalon = document.getElementById('cd-talon');
    this.cdWind = document.getElementById('cd-wind');
    this.cdShockwave = document.getElementById('cd-shockwave');

    // Artificial Horizon Elements
    this.horizonLadder = document.getElementById('hud-horizon-ladder');
    this.horizonReticle = document.getElementById('hud-horizon-reticle');

    // Minimap
    this.minimapCanvas = document.getElementById('minimap-canvas');
    if (this.minimapCanvas) {
      this.minimapCtx = this.minimapCanvas.getContext('2d');
    }

    // Inventory elements
    this.twigCount = document.getElementById('inv-twigs');
    this.featherCount = document.getElementById('inv-feathers');
    this.pebbleCount = document.getElementById('inv-pebbles');
    this.berryCount = document.getElementById('inv-berries');

    // Speed Lines Canvas
    this.speedCanvas = document.getElementById('speed-lines-canvas');
    if (this.speedCanvas) {
      this.speedCtx = this.speedCanvas.getContext('2d');
      this._initSpeedLines();
    }
  }

  _initSpeedLines() {
    this.speedLines = [];
    for (let i = 0; i < 60; i++) {
      this.speedLines.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        length: 20 + Math.random() * 80,
        speed: 15 + Math.random() * 30
      });
    }
  }

  update(delta) {
    const aero = this.bird.aerodynamics;
    const speedKmh = Math.round(aero.airspeed * 3.6);
    const altMeters = Math.round(this.bird.position.y);
    const groundClearance = Math.max(0, Math.round(aero.altitude));
    const aoaDeg = (aero.aoa * 180 / Math.PI).toFixed(1);
    const gForce = aero.gForce.toFixed(1);

    // Update Numerical Telemetry
    if (this.speedValue) this.speedValue.textContent = speedKmh;
    if (this.altValue) this.altValue.textContent = altMeters;
    if (this.groundAlt) this.groundAlt.textContent = `${groundClearance}m AGL`;
    if (this.aoaValue) this.aoaValue.textContent = `${aoaDeg}°`;
    if (this.gForceValue) this.gForceValue.textContent = `${gForce} G`;

    // Health & Stamina Bar
    const hpPct = Math.max(0, Math.min(100, (this.bird.health / this.bird.maxHealth) * 100));
    if (this.healthFill) this.healthFill.style.width = `${hpPct}%`;
    if (this.healthVal) this.healthVal.textContent = `${Math.round(this.bird.health)} HP`;

    const stamPct = Math.max(0, Math.min(100, this.bird.stamina));
    if (this.staminaFill) this.staminaFill.style.width = `${stamPct}%`;
    if (this.staminaVal) this.staminaVal.textContent = `${Math.round(stamPct)}%`;

    // Ability Cooldown Overlays
    if (this.cdTalon) {
      const pct = (this.bird.cooldowns.talon / this.bird.maxCooldowns.talon) * 100;
      this.cdTalon.style.height = `${pct}%`;
    }
    if (this.cdWind) {
      const pct = (this.bird.cooldowns.windBlade / this.bird.maxCooldowns.windBlade) * 100;
      this.cdWind.style.height = `${pct}%`;
    }
    if (this.cdShockwave) {
      const pct = (this.bird.cooldowns.shockwave / this.bird.maxCooldowns.shockwave) * 100;
      this.cdShockwave.style.height = `${pct}%`;
    }

    // Flight State Badge
    if (this.flightStateBadge) {
      if (this.bird.isGrounded) {
        this.flightStateBadge.textContent = 'PERCHED / GROUNDED';
        this.flightStateBadge.className = 'state-badge badge-grounded';
      } else if (aero.isTucking) {
        this.flightStateBadge.textContent = 'HIGH SPEED DIVE';
        this.flightStateBadge.className = 'state-badge badge-dive';
      } else if (aero.isFlaring) {
        this.flightStateBadge.textContent = 'AIRBRAKE / FLARE';
        this.flightStateBadge.className = 'state-badge badge-flare';
      } else if (this.bird.isFlapping) {
        this.flightStateBadge.textContent = 'FLAPPING POWER';
        this.flightStateBadge.className = 'state-badge badge-flap';
      } else {
        this.flightStateBadge.textContent = 'GLIDING';
        this.flightStateBadge.className = 'state-badge badge-glide';
      }
    }

    // Stall Warning
    if (this.stallWarning) {
      this.stallWarning.style.display = aero.isStalled ? 'flex' : 'none';
    }

    // Updraft Indicator
    if (this.thermalIndicator) {
      this.thermalIndicator.style.display = aero.inUpdraft ? 'flex' : 'none';
    }

    // Artificial Horizon Pitch & Roll update
    if (this.horizonLadder) {
      const euler = this.bird.rotation;
      const pitchOffset = euler.x * 60; // Pixels per radian pitch
      const rollDeg = -euler.z * (180 / Math.PI);
      this.horizonLadder.style.transform = `rotate(${rollDeg}deg) translateY(${pitchOffset}px)`;
    }

    // Inventory Display
    if (this.twigCount) this.twigCount.textContent = this.bird.inventory.twigs || 0;
    if (this.featherCount) this.featherCount.textContent = this.bird.inventory.feathers || 0;
    if (this.pebbleCount) this.pebbleCount.textContent = this.bird.inventory.pebbles || 0;
    if (this.berryCount) this.berryCount.textContent = this.bird.inventory.berries || 0;

    // Render Minimap Radar
    this._drawMinimap();

    // Render Speed Wind Streaks
    this._drawSpeedLines(aero.airspeed);
  }

  _drawMinimap() {
    if (!this.minimapCtx || !this.minimapCanvas) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radarScale = 0.22; // Pixels per meter

    ctx.clearRect(0, 0, w, h);

    // Radar grid rings
    ctx.strokeStyle = 'rgba(100, 220, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 35, 0, Math.PI * 2);
    ctx.arc(cx, cy, 70, 0, Math.PI * 2);
    ctx.stroke();

    const birdX = this.bird.position.x;
    const birdZ = this.bird.position.z;

    // Draw Thermals on Minimap
    this.world.updrafts.forEach(u => {
      const dx = (u.position.x - birdX) * radarScale;
      const dz = (u.position.z - birdZ) * radarScale;
      if (Math.hypot(dx, dz) < cx - 5) {
        ctx.fillStyle = 'rgba(255, 215, 0, 0.6)';
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dz, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Draw Enemy Birds on Minimap
    if (this.world.enemies) {
      this.world.enemies.forEach(enemy => {
        if (!enemy.isDead) {
          const ex = (enemy.position.x - birdX) * radarScale;
          const ez = (enemy.position.z - birdZ) * radarScale;
          if (Math.hypot(ex, ez) < cx - 5) {
            ctx.fillStyle = '#ff2255';
            ctx.beginPath();
            ctx.arc(cx + ex, cy + ez, 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });
    }

    // Draw Nest Sanctuary Icon on Minimap
    if (this.world.nestSite) {
      const nx = (this.world.nestSite.position.x - birdX) * radarScale;
      const nz = (this.world.nestSite.position.z - birdZ) * radarScale;
      const dist = Math.hypot(nx, nz);
      const clampedX = dist > cx - 8 ? cx + (nx / dist) * (cx - 10) : cx + nx;
      const clampedY = dist > cy - 8 ? cy + (nz / dist) * (cy - 10) : cy + nz;

      ctx.fillStyle = '#ff8800';
      ctx.beginPath();
      ctx.arc(clampedX, clampedY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }

    // Draw Bird Center Heading Indicator
    ctx.save();
    ctx.translate(cx, cy);
    const forward = this.bird.aerodynamics._forward;
    const heading = Math.atan2(forward.x, forward.z);
    ctx.rotate(heading);

    ctx.fillStyle = '#00f2ff';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawSpeedLines(airspeed) {
    if (!this.speedCtx || !this.speedCanvas) return;
    const ctx = this.speedCtx;
    const w = (this.speedCanvas.width = window.innerWidth);
    const h = (this.speedCanvas.height = window.innerHeight);

    ctx.clearRect(0, 0, w, h);

    if (airspeed < 26) return; // Only show during high speed

    const intensity = Math.min(1.0, (airspeed - 26) / 25);
    const cx = w / 2;
    const cy = h / 2;

    ctx.strokeStyle = `rgba(200, 240, 255, ${0.25 * intensity})`;
    ctx.lineWidth = 1.5;

    for (const line of this.speedLines) {
      const dx = line.x - cx;
      const dy = line.y - cy;
      const angle = Math.atan2(dy, dx);
      const len = line.length * (1 + intensity * 1.5);

      ctx.beginPath();
      ctx.moveTo(line.x, line.y);
      ctx.lineTo(line.x + Math.cos(angle) * len, line.y + Math.sin(angle) * len);
      ctx.stroke();

      line.x += Math.cos(angle) * line.speed * intensity;
      line.y += Math.sin(angle) * line.speed * intensity;

      if (line.x < 0 || line.x > w || line.y < 0 || line.y > h) {
        line.x = cx + (Math.random() - 0.5) * (w * 0.7);
        line.y = cy + (Math.random() - 0.5) * (h * 0.7);
      }
    }
  }
}
