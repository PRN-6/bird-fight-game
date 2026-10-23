import * as THREE from 'three';
import { Peer } from 'peerjs';
import { RemoteBird } from '../entities/RemoteBird.js';

export class NetworkManager {
  constructor(game) {
    this.game = game;
    this.peer = null;
    this.connections = new Map(); // peerId -> DataConnection
    this.remotePlayers = new Map(); // peerId -> RemoteBird
    this.isHost = false;
    this.roomId = null;
    this.myPeerId = null;
    this.playerName = 'Skylord_' + Math.floor(Math.random() * 1000);
    this.playerColor = [0x2288dd, 0x10b981, 0xef4444, 0xa855f7, 0xf59e0b][Math.floor(Math.random() * 5)];

    this.sendTimer = 0;
    this.sendInterval = 1 / 25; // 25 Hz update tick
  }

  // Create a new Sky Room (Host)
  createRoom(customCode = null, onReady) {
    this.isHost = true;
    const code = customCode || 'SKY-' + Math.floor(1000 + Math.random() * 9000);
    this.roomId = code;

    // Use free public PeerJS server
    this.peer = new Peer(this.roomId, {
      debug: 1
    });

    this.peer.on('open', (id) => {
      this.myPeerId = id;
      console.log('Room created with ID:', id);
      if (onReady) onReady(this.roomId);
    });

    this.peer.on('connection', (conn) => {
      this._setupConnection(conn);
    });

    this.peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (err.type === 'unavailable-id') {
        // Retry with randomized suffix if room code taken
        this.createRoom(code + Math.floor(Math.random() * 10), onReady);
      }
    });
  }

  // Join an existing Sky Room
  joinRoom(roomId, onConnected, onError) {
    this.isHost = false;
    this.roomId = roomId.trim().toUpperCase();

    this.peer = new Peer({
      debug: 1
    });

    this.peer.on('open', (myId) => {
      this.myPeerId = myId;
      console.log('Connecting to room:', this.roomId);
      const conn = this.peer.connect(this.roomId, {
        reliable: false, // Low latency UDP-like channel for 60fps movement
        metadata: {
          name: this.playerName,
          color: this.playerColor
        }
      });

      this._setupConnection(conn);

      conn.on('open', () => {
        console.log('Connected to Host!');
        if (onConnected) onConnected(this.roomId);
      });
    });

    this.peer.on('error', (err) => {
      console.error('Join error:', err);
      if (onError) onError(err);
    });
  }

  _setupConnection(conn) {
    const peerId = conn.peer;
    this.connections.set(peerId, conn);

    conn.on('open', () => {
      // Spawn remote player bird
      const color = conn.metadata?.color || 0x38bdf8;
      const name = conn.metadata?.name || 'Peer_' + peerId.substring(0, 4);
      const remoteBird = new RemoteBird(this.game.scene, peerId, name, color);
      this.remotePlayers.set(peerId, remoteBird);

      // Register remote bird as target in combat system
      if (this.game.world && this.game.world.enemies) {
        this.game.world.enemies.push(remoteBird);
      }

      this.game._showPickupToast(`🌐 ${name} Joined The Sky!`);
    });

    conn.on('data', (data) => {
      this._handleNetworkMessage(peerId, data);
    });

    conn.on('close', () => {
      this._removePlayer(peerId);
    });

    conn.on('error', () => {
      this._removePlayer(peerId);
    });
  }

  _removePlayer(peerId) {
    const remote = this.remotePlayers.get(peerId);
    if (remote) {
      if (this.game.world && this.game.world.enemies) {
        const idx = this.game.world.enemies.indexOf(remote);
        if (idx >= 0) {
          this.game.world.enemies.splice(idx, 1);
        }
      }
      remote.destroy();
      this.remotePlayers.delete(peerId);
    }
    this.connections.delete(peerId);
    this.game._showPickupToast('Player left the sky.');
  }

  _handleNetworkMessage(peerId, data) {
    if (!data) return;

    if (data.type === 'POS') {
      const remote = this.remotePlayers.get(peerId);
      if (remote) {
        remote.setNetworkState(data);
      }
    } else if (data.type === 'ATTACK_WINDBLADE') {
      // Spawn projectile on client
      const start = new THREE.Vector3(...data.pos);
      const dir = new THREE.Vector3(...data.dir);
      this.game.combat.spawnWindBlade(start, dir, data.dmg, 'enemy');
      this.game.sound.playWindBlade();
    } else if (data.type === 'ATTACK_SHOCKWAVE') {
      const center = new THREE.Vector3(...data.pos);
      this.game.combat.spawnSonicShockwave(center, data.radius, data.dmg, 'enemy');
      this.game.sound.playSonicShockwave();
    } else if (data.type === 'RESOURCE_COLLECTED') {
      // Synchronize collected resources
      const res = this.game.world.resources[data.index];
      if (res && !res.collected) {
        res.collected = true;
        this.game.scene.remove(res.mesh);
      }
    }
  }

  broadcast(message) {
    this.connections.forEach((conn) => {
      if (conn.open) {
        conn.send(message);
      }
    });
  }

  broadcastAttack(type, payload) {
    this.broadcast({
      type,
      ...payload
    });
  }

  update(delta, playerBird) {
    // Send local bird transform to all connected peers
    this.sendTimer += delta;
    if (this.sendTimer >= this.sendInterval && this.connections.size > 0) {
      this.sendTimer = 0;

      const p = playerBird.position;
      const q = playerBird.quaternion;

      const packet = {
        type: 'POS',
        pos: [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(p.z * 100) / 100],
        quat: [Math.round(q.x * 1000) / 1000, Math.round(q.y * 1000) / 1000, Math.round(q.z * 1000) / 1000, Math.round(q.w * 1000) / 1000],
        flap: playerBird.isFlapping,
        dive: playerBird.aerodynamics.isTucking,
        flare: playerBird.aerodynamics.isFlaring,
        hp: playerBird.health
      };

      this.broadcast(packet);
    }

    // Update remote birds rendering & interpolation
    this.remotePlayers.forEach((remote) => {
      remote.update(delta, this.game.camera);
    });
  }
}
