document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const restartButton = document.getElementById("restartButton");
  const gameOverScreen = document.getElementById("gameOverScreen");
  const gameOverMessage = document.getElementById("gameOverMessage");

  // --- Game Constants ---
  const GRAVITY = 0.2;
  const MAX_HEALTH = 100;
  const POWER_MULTIPLIER = 0.3;
  const WIND_MAX_FORCE = 0.05;

  // Player body constants
  const HEAD_RADIUS = 8;
  const BODY_HEIGHT = 25;
  const LEG_LENGTH = 15;
  const PLAYER_DRAW_OFFSET = 5; // How much above the terrain the "feet" are drawn (to avoid being in terrain)

  // Damage constants (Note: Damage amounts are independent of projectile type for simplicity)
  const DAMAGE_HEAD = 40;
  const DAMAGE_BODY = 25;
  const DAMAGE_LEGS = 15;

  // Knockback constants
  const KNOCKBACK_POWER_MULTIPLIER = 0.8;
  const KNOCKBACK_ANIMATION_FRAMES = 20;

  // Terrain constants
  const TERRAIN_SEGMENT_WIDTH = 20;
  const TERRAIN_BASE_Y = canvas.height - 30; // Base Y for terrain generation, independent of slider
  const MIN_TERRAIN_Y = canvas.height * 0.4;
  const MAX_TERRAIN_Y = canvas.height - 10;
  const TRAJECTORY_MAX_SIM_STEPS = 500;
  const TRAJECTORY_PREVIEW_FRACTION = 1 / 3;

  // --- UI Elements Configuration ---
  const UI_PADDING = 15;
  const SLIDER_WIDTH = 120;
  const SLIDER_HEIGHT = 8;
  const SLIDER_THUMB_RADIUS = 10;
  const BUTTON_WIDTH = 80;
  const BUTTON_HEIGHT = 40;
  const INFO_TEXT_SIZE = 16;
  const HEALTH_BAR_WIDTH = 150;
  const HEALTH_BAR_HEIGHT = 20;
  const HEALTH_BAR_VERTICAL_MARGIN = 5; // Margin between the player name text and the health bar

  // --- Projectile Definitions ---
  const PROJECTILE_TYPES = [
    {
      type: "arrow",
      radius: 5,
      draw: (ctx, proj) => {
        // Arrow drawing logic using projectile properties
        ctx.fillStyle = "#7f8c8d";
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 1;
        const arrowLength = 15;
        const headLength = 7;
        const headWidth = 5;
        const angle = Math.atan2(proj.vy, proj.vx); // Use projectile's velocity

        ctx.save();
        ctx.translate(proj.x, proj.y); // Translate to projectile's position
        ctx.rotate(angle);

        ctx.beginPath();
        ctx.moveTo(-arrowLength / 2, 0);
        ctx.lineTo(arrowLength / 2, 0);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(arrowLength / 2, 0);
        ctx.lineTo(arrowLength / 2 - headLength, -headWidth / 2);
        ctx.lineTo(arrowLength / 2 - headLength, headWidth / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      },
    },
    {
      type: "bomb",
      radius: 8,
      draw: (ctx, proj) => {
        ctx.fillStyle = "#34495e"; // Dark grey/black
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
        ctx.fill();
        // Optional: add a small fuse visually
        ctx.strokeStyle = "#f1c40f"; // Yellow/orange fuse
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(proj.x + proj.radius * 0.7, proj.y - proj.radius * 0.7);
        ctx.lineTo(proj.x + proj.radius * 1.2, proj.y - proj.radius * 1.2);
        ctx.stroke();
      },
    },
    {
      type: "watermelon",
      radius: 7,
      draw: (ctx, proj) => {
        // Outer green rind
        ctx.fillStyle = "#2ecc71"; // Green
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
        ctx.fill();
        // Inner red
        ctx.fillStyle = "#e74c3c"; // Red
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, proj.radius * 0.7, 0, Math.PI * 2); // Smaller red part
        ctx.fill();
        // Optional: add black seeds
        ctx.fillStyle = "#000";
        ctx.fillRect(
          proj.x - proj.radius * 0.3,
          proj.y - proj.radius * 0.3,
          2,
          2,
        );
        ctx.fillRect(
          proj.x + proj.radius * 0.3,
          proj.y - proj.radius * 0.3,
          2,
          2,
        );
        ctx.fillRect(proj.x, proj.y + proj.radius * 0.3, 2, 2);
      },
    },
  ];

  // Define properties for drawing and interacting with UI elements
  let uiElements = {
    // Player 1 Controls
    player1AngleSlider: {
      id: "p1Angle",
      x: UI_PADDING,
      y: canvas.height - 110,
      width: SLIDER_WIDTH,
      height: SLIDER_HEIGHT,
      min: 0,
      max: 90,
      value: 45,
      type: "slider",
      color: "#e74c3c",
      text: "Angle:",
      disabled: false,
    },
    player1PowerSlider: {
      id: "p1Power",
      x: UI_PADDING,
      y: canvas.height - 70,
      width: SLIDER_WIDTH,
      height: SLIDER_HEIGHT,
      min: 10,
      max: 100,
      value: 50,
      type: "slider",
      color: "#e74c3c",
      text: "Power:",
      disabled: false,
    },

    // Player 2 Controls
    player2AngleSlider: {
      id: "p2Angle",
      x: canvas.width - UI_PADDING - SLIDER_WIDTH,
      y: canvas.height - 110,
      width: SLIDER_WIDTH,
      height: SLIDER_HEIGHT,
      min: 0,
      max: 90,
      value: 45,
      type: "slider",
      color: "#3498db",
      text: "Angle:",
      disabled: false,
    },
    player2PowerSlider: {
      id: "p2Power",
      x: canvas.width - UI_PADDING - SLIDER_WIDTH,
      y: canvas.height - 70,
      width: SLIDER_WIDTH,
      height: SLIDER_HEIGHT,
      min: 10,
      max: 100,
      value: 50,
      type: "slider",
      color: "#3498db",
      text: "Power:",
      disabled: false,
    },

    // Fire Button
    fireButton: {
      id: "fire",
      x: canvas.width / 2 - BUTTON_WIDTH / 2,
      y: canvas.height - 90,
      width: BUTTON_WIDTH,
      height: BUTTON_HEIGHT,
      text: "FIRE!",
      color: "#e74c3c",
      type: "button",
      disabled: false,
    },

    // Game Setup Sliders
    playerDistanceSlider: {
      id: "distance",
      x: canvas.width / 2 - SLIDER_WIDTH - 20,
      y: canvas.height - 40,
      width: SLIDER_WIDTH,
      height: SLIDER_HEIGHT,
      min: 40,
      max: 80,
      value: 70,
      type: "slider",
      color: "#f39c12",
      text: "Distance:",
      disabled: false,
    },
    terrainHeightSlider: {
      id: "hilliness",
      x: canvas.width / 2 + 20,
      y: canvas.height - 40,
      width: SLIDER_WIDTH,
      height: SLIDER_HEIGHT,
      min: 5,
      max: 40,
      value: 15,
      type: "slider",
      color: "#f39c12",
      text: "Hilliness:",
      disabled: false,
    },

    // Info Displays (not interactive)
    player1HealthBar: {
      x: UI_PADDING,
      textY: UI_PADDING + 5, // Y position for the text (5px from top)
      barY: UI_PADDING + 5 + INFO_TEXT_SIZE + HEALTH_BAR_VERTICAL_MARGIN, // Y position for the health bar rectangle (below text)
      width: HEALTH_BAR_WIDTH,
      height: HEALTH_BAR_HEIGHT,
      value: 100,
      color: "#e74c3c",
    },
    player2HealthBar: {
      x: canvas.width - UI_PADDING - HEALTH_BAR_WIDTH,
      textY: UI_PADDING + 5, // Y position for the text (5px from top)
      barY: UI_PADDING + 5 + INFO_TEXT_SIZE + HEALTH_BAR_VERTICAL_MARGIN, // Y position for the health bar rectangle (below text)
      width: HEALTH_BAR_WIDTH,
      height: HEALTH_BAR_HEIGHT,
      value: 100,
      color: "#3498db",
    },
    turnIndicator: {
      x: canvas.width / 2,
      y:
        UI_PADDING +
        5 +
        INFO_TEXT_SIZE +
        HEALTH_BAR_VERTICAL_MARGIN +
        HEALTH_BAR_HEIGHT / 2, // Centered vertically with the health bars
      text: "",
      color: "#f1c40f",
      type: "text",
    },
    windInfo: {
      x: canvas.width / 2,
      y:
        UI_PADDING +
        5 +
        INFO_TEXT_SIZE +
        HEALTH_BAR_VERTICAL_MARGIN +
        HEALTH_BAR_HEIGHT / 2 +
        INFO_TEXT_SIZE +
        5, // Below turn indicator
      text: "",
      color: "#3498db",
      type: "text",
    },
  };

  // --- Game State Variables (Declared once globally in this scope) ---
  let players = [];
  let currentPlayerIndex = 0;
  let projectile = null;
  let gameActive = false;
  let gameOver = false;
  let currentWind = 0;
  let terrain = [];

  // Dynamic game settings (controlled by sliders) - initialized from UI elements
  let currentTerrainMaxHeightChange = uiElements.terrainHeightSlider.value;
  let currentPlayerDistancePercent = uiElements.playerDistanceSlider.value;

  // Mouse interaction variables
  let isDragging = false;
  let selectedSlider = null;
  let mouse = { x: 0, y: 0 };

  // --- Player Class ---
  class Player {
    constructor(id, color) {
      this.id = id;
      this.color = color;
      this.x = 0;
      this.health = MAX_HEALTH;
      this.direction = id === 1 ? 1 : -1;

      // Initialize player's angle/power from the UI elements' current values
      this.currentAngle =
        id === 1
          ? uiElements.player1AngleSlider.value
          : uiElements.player2AngleSlider.value;
      this.currentPower =
        id === 1
          ? uiElements.player1PowerSlider.value
          : uiElements.player2PowerSlider.value;

      this.isKnockingBack = false;
      this.knockbackStartX = 0;
      this.knockbackTargetX = 0;
      this.knockbackFrames = 0;
    }

    get base_y() {
      return findTerrainY(this.x);
    }
    get headY() {
      return (
        this.base_y -
        (LEG_LENGTH + BODY_HEIGHT + HEAD_RADIUS + PLAYER_DRAW_OFFSET)
      );
    }
    get bodyY() {
      return this.base_y - (LEG_LENGTH + BODY_HEIGHT / 2 + PLAYER_DRAW_OFFSET);
    }
    get legsY() {
      return this.base_y - (LEG_LENGTH / 2 + PLAYER_DRAW_OFFSET);
    }

    draw() {
      ctx.fillStyle = this.color;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;

      // Head
      ctx.beginPath();
      ctx.arc(this.x, this.headY, HEAD_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Body
      ctx.beginPath();
      ctx.moveTo(this.x, this.headY + HEAD_RADIUS);
      ctx.lineTo(this.x, this.base_y - LEG_LENGTH - PLAYER_DRAW_OFFSET);
      ctx.stroke();

      // Legs
      ctx.beginPath();
      ctx.moveTo(this.x, this.base_y - LEG_LENGTH - PLAYER_DRAW_OFFSET);
      ctx.lineTo(this.x - HEAD_RADIUS, this.base_y - PLAYER_DRAW_OFFSET);
      ctx.moveTo(this.x, this.base_y - LEG_LENGTH - PLAYER_DRAW_OFFSET);
      ctx.lineTo(this.x + HEAD_RADIUS, this.base_y - PLAYER_DRAW_OFFSET);
      ctx.stroke();

      // Cannon/Arm - Draw always to show aiming angle
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      const angleRad = toRadians(this.currentAngle);
      const armLength = HEAD_RADIUS * 2;
      const armStartX = this.x + this.direction * HEAD_RADIUS * 0.5;
      const armStartY = this.headY + HEAD_RADIUS / 2;
      const armEndX =
        armStartX + Math.cos(angleRad) * armLength * this.direction;
      const armEndY = armStartY - Math.sin(angleRad) * armLength;
      ctx.moveTo(armStartX, armStartY);
      ctx.lineTo(armEndX, armEndY);
      ctx.stroke();
    }

    takeDamage(amount) {
      this.health -= amount;
      if (this.health < 0) this.health = 0;
      uiElements.player1HealthBar.value = players[0].health;
      uiElements.player2HealthBar.value = players[1].health;
    }

    applyKnockback(projectilePower) {
      const knockbackDirection = this.id === 1 ? -1 : 1;
      const actualKnockbackDistance =
        projectilePower * KNOCKBACK_POWER_MULTIPLIER;

      this.knockbackStartX = this.x;
      this.knockbackTargetX =
        this.x + knockbackDirection * actualKnockbackDistance;

      const playerVisualHalfWidth = HEAD_RADIUS;
      this.knockbackTargetX = Math.max(
        playerVisualHalfWidth,
        Math.min(canvas.width - playerVisualHalfWidth, this.knockbackTargetX),
      );

      this.isKnockingBack = true;
      this.knockbackFrames = KNOCKBACK_ANIMATION_FRAMES;
    }

    updateKnockback() {
      if (!this.isKnockingBack) return;

      if (this.knockbackFrames > 0) {
        const progress = 1 - this.knockbackFrames / KNOCKBACK_ANIMATION_FRAMES;
        this.x = lerp(this.knockbackStartX, this.knockbackTargetX, progress);
        this.knockbackFrames--;
      } else {
        this.x = this.knockbackTargetX;
        this.isKnockingBack = false;
      }
    }
  }

  // --- Utility Functions ---
  function toRadians(angle) {
    return angle * (Math.PI / 180);
  }
  function lerp(start, end, progress) {
    return start * (1 - progress) + end * progress;
  }

  function getRandomWind() {
    currentWind = (Math.random() * 2 - 1) * WIND_MAX_FORCE;
    uiElements.windInfo.text = `Wind: ${currentWind.toFixed(2)} m/s ${currentWind > 0 ? "→" : currentWind < 0 ? "←" : ""}`;
  }

  // --- Terrain Generation ---
  function generateTerrain() {
    terrain = [];
    let currentY = TERRAIN_BASE_Y;
    let x = 0;

    terrain.push({ x: 0, y: currentY });

    while (x < canvas.width) {
      x += TERRAIN_SEGMENT_WIDTH;
      currentY += (Math.random() * 2 - 1) * currentTerrainMaxHeightChange;
      currentY = Math.max(MIN_TERRAIN_Y, Math.min(MAX_TERRAIN_Y, currentY));
      terrain.push({ x: x, y: currentY });
    }
    if (terrain[terrain.length - 1].x < canvas.width) {
      terrain.push({ x: canvas.width, y: currentY });
    }
  }

  function findTerrainY(x) {
    if (x < terrain[0].x) return terrain[0].y;
    if (x > terrain[terrain.length - 1].x) return terrain[terrain.length - 1].y;

    for (let i = 0; i < terrain.length - 1; i++) {
      const p1 = terrain[i];
      const p2 = terrain[i + 1];
      if (x >= p1.x && x <= p2.x) {
        return p1.y + (p2.y - p1.y) * ((x - p1.x) / (p2.x - p1.x));
      }
    }
    return terrain[terrain.length - 1].y;
  }

  // --- Drawing Functions ---
  function drawBackground() {
    ctx.fillStyle = "#87ceeb";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fafa68";
    ctx.beginPath();
    ctx.arc(canvas.width * 0.8, canvas.height * 0.2, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTerrain() {
    if (terrain.length === 0) return;
    ctx.fillStyle = "#27ae60";
    ctx.beginPath();
    ctx.moveTo(terrain[0].x, terrain[0].y);
    for (let i = 1; i < terrain.length; i++) {
      ctx.lineTo(terrain[i].x, terrain[i].y);
    }
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.closePath();
    ctx.fill();
  }

  function drawProjectile() {
    if (!projectile || !projectile.active) return;
    // Call the draw function specific to the projectile type
    projectile.draw(ctx, projectile);
  }

  function drawTrajectory() {
    if (gameActive || gameOver || players.some((p) => p.isKnockingBack)) return;

    const player = players[currentPlayerIndex];
    const angle = toRadians(player.currentAngle);
    const power = player.currentPower;

    let tempX = player.x;
    let tempY = player.headY + HEAD_RADIUS / 2;
    let tempVx = Math.cos(angle) * power * POWER_MULTIPLIER * player.direction;
    let tempVy = -Math.sin(angle) * power * POWER_MULTIPLIER;

    const totalPlayersDistance = Math.abs(players[1].x - players[0].x);
    const maxPreviewHorizontalDistance =
      totalPlayersDistance * TRAJECTORY_PREVIEW_FRACTION;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(tempX, tempY);

    for (let i = 0; i < TRAJECTORY_MAX_SIM_STEPS; i++) {
      tempX += tempVx;
      tempY += tempVy;
      tempVy += GRAVITY;
      tempVx += currentWind;

      const terrainAtTempX = findTerrainY(tempX);

      if (
        Math.abs(tempX - player.x) > maxPreviewHorizontalDistance ||
        tempY >= terrainAtTempX ||
        tempX < -100 ||
        tempX > canvas.width + 100
      ) {
        ctx.lineTo(tempX, tempY);
        break;
      }
      ctx.lineTo(tempX, tempY);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // --- Drawing UI Elements on Canvas ---
  function drawSlider(slider) {
    // Draw track
    ctx.fillStyle = "#7f8c8d";
    ctx.fillRect(slider.x, slider.y, slider.width, slider.height);

    // Draw thumb
    const thumbX =
      slider.x +
      ((slider.value - slider.min) / (slider.max - slider.min)) * slider.width;
    ctx.fillStyle = slider.color;
    ctx.beginPath();
    ctx.arc(
      thumbX,
      slider.y + slider.height / 2,
      SLIDER_THUMB_RADIUS,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw label and value
    ctx.fillStyle = "#ecf0f1";
    ctx.font = `bold ${INFO_TEXT_SIZE - 2}px Arial`;
    ctx.textAlign = "left";
    ctx.fillText(slider.text, slider.x, slider.y - 10);
    ctx.textAlign = "right";
    ctx.fillText(
      slider.value +
        (slider.text.includes("Angle")
          ? "°"
          : slider.text.includes("Distance")
            ? "%"
            : ""),
      slider.x + slider.width,
      slider.y - 10,
    );

    // Draw overlay if disabled
    if (slider.disabled) {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      // Make disabled overlay cover the text and thumb area too
      ctx.fillRect(
        slider.x,
        slider.y - SLIDER_THUMB_RADIUS - 10,
        slider.width,
        slider.height + SLIDER_THUMB_RADIUS * 2 + 10,
      );
    }
  }

  function drawButton(button) {
    ctx.fillStyle = button.color;
    ctx.fillRect(button.x, button.y, button.width, button.height);
    ctx.fillStyle = "white";
    ctx.font = `bold ${INFO_TEXT_SIZE}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      button.text,
      button.x + button.width / 2,
      button.y + button.height / 2,
    );

    // Draw overlay if disabled
    if (button.disabled) {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(button.x, button.y, button.width, button.height);
    }
  }

  function drawHealthBar(healthBar, playerHealth) {
    ctx.strokeStyle = "#95a5a6";
    ctx.lineWidth = 1;
    // Use barY for the rectangle
    ctx.strokeRect(
      healthBar.x,
      healthBar.barY,
      healthBar.width,
      healthBar.height,
    );

    const healthColor =
      playerHealth > 50 ? "#2ecc71" : playerHealth > 20 ? "#f1c40f" : "#e74c3c";
    ctx.fillStyle = healthColor;
    // Use barY for the rectangle
    ctx.fillRect(
      healthBar.x,
      healthBar.barY,
      healthBar.width * (playerHealth / MAX_HEALTH),
      healthBar.height,
    );

    ctx.fillStyle = healthBar.color;
    ctx.font = `bold ${INFO_TEXT_SIZE}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top"; // Keep textBaseline as top
    // Use textY for the text
    ctx.fillText(
      `Player ${healthBar.color === "#e74c3c" ? "1 (Red)" : "2 (Blue)"}`,
      healthBar.x + healthBar.width / 2,
      healthBar.textY, // Draw text at textY
    );
  }

  function drawInfoText(info) {
    ctx.fillStyle = info.color;
    ctx.font = `bold ${INFO_TEXT_SIZE}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(info.text, info.x, info.y);
  }

  // Main UI drawing function
  function drawUI() {
    drawSlider(uiElements.player1AngleSlider);
    drawSlider(uiElements.player1PowerSlider);

    drawSlider(uiElements.player2AngleSlider);
    drawSlider(uiElements.player2PowerSlider);

    drawButton(uiElements.fireButton);

    ctx.fillStyle = "#f39c12";
    ctx.font = `bold ${INFO_TEXT_SIZE}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("Game Setup", canvas.width / 2, canvas.height - 70);
    drawSlider(uiElements.playerDistanceSlider);
    drawSlider(uiElements.terrainHeightSlider);

    // Pass the health bar object and the player's current health
    drawHealthBar(uiElements.player1HealthBar, players[0].health);
    drawHealthBar(uiElements.player2HealthBar, players[1].health);

    drawInfoText(uiElements.turnIndicator);
    drawInfoText(uiElements.windInfo);
  }

  // --- Game Logic Functions ---
  function initializeGame() {
    gameOver = false;
    gameOverScreen.style.display = "none";

    // Update dynamic game constants from UI sliders' current values
    currentTerrainMaxHeightChange = uiElements.terrainHeightSlider.value;
    currentPlayerDistancePercent = uiElements.playerDistanceSlider.value;

    generateTerrain();

    players = [new Player(1, "#e74c3c"), new Player(2, "#3498db")];

    const distance = canvas.width * (currentPlayerDistancePercent / 100);
    players[0].x = canvas.width / 2 - distance / 2;
    players[1].x = canvas.width / 2 + distance / 2;

    currentPlayerIndex = 0;
    projectile = null;
    gameActive = false;

    getRandomWind();
    updateUIState(); // Update the internal state of UI elements
  }

  // Updates the internal state of UI elements (e.g., their 'disabled' property)
  function updateUIState() {
    const currentPlayer = players[currentPlayerIndex];
    const isAnyPlayerKnockingBack = players.some((p) => p.isKnockingBack);

    // --- Player Control Sliders ---
    uiElements.player1AngleSlider.disabled =
      currentPlayerIndex !== 0 ||
      gameActive ||
      isAnyPlayerKnockingBack ||
      gameOver;
    uiElements.player1PowerSlider.disabled =
      currentPlayerIndex !== 0 ||
      gameActive ||
      isAnyPlayerKnockingBack ||
      gameOver;
    uiElements.player2AngleSlider.disabled =
      currentPlayerIndex !== 1 ||
      gameActive ||
      isAnyPlayerKnockingBack ||
      gameOver;
    uiElements.player2PowerSlider.disabled =
      currentPlayerIndex !== 1 ||
      gameActive ||
      isAnyPlayerKnockingBack ||
      gameOver;

    // --- Fire Button ---
    uiElements.fireButton.disabled =
      gameActive || gameOver || isAnyPlayerKnockingBack;

    // --- Game Setup Sliders ---
    // These are only disabled if the game is over
    uiElements.playerDistanceSlider.disabled = gameOver;
    uiElements.terrainHeightSlider.disabled = gameOver;

    // --- Update player's angle/power from UI slider values ---
    // This is important because the UI slider's 'value' changes on mouse drag
    // and the player's 'currentAngle'/'currentPower' needs to reflect that for trajectory drawing.
    players[0].currentAngle = uiElements.player1AngleSlider.value;
    players[0].currentPower = uiElements.player1PowerSlider.value;
    players[1].currentAngle = uiElements.player2AngleSlider.value;
    players[1].currentPower = uiElements.player2PowerSlider.value;

    // --- Update visual values for UI elements (Health Bars, Turn Indicator) ---
    uiElements.player1HealthBar.value = players[0].health;
    uiElements.player2HealthBar.value = players[1].health;
    uiElements.turnIndicator.text = `${currentPlayer.id === 1 ? "Player 1 (Red)" : "Player 2 (Blue)"}'s Turn`;
  }

  function fireProjectile() {
    if (uiElements.fireButton.disabled) return;

    const player = players[currentPlayerIndex];
    const angle = toRadians(player.currentAngle);
    const power = player.currentPower;

    const initialVx =
      Math.cos(angle) * power * POWER_MULTIPLIER * player.direction;
    const initialVy = -Math.sin(angle) * power * POWER_MULTIPLIER;

    // Select a random projectile type
    const randomProjectileType =
      PROJECTILE_TYPES[Math.floor(Math.random() * PROJECTILE_TYPES.length)];

    projectile = {
      x: player.x,
      y: player.headY + HEAD_RADIUS / 2,
      vx: initialVx,
      vy: initialVy,
      active: true,
      firedPower: power,
      // Assign properties from the selected type
      type: randomProjectileType.type,
      radius: randomProjectileType.radius,
      draw: randomProjectileType.draw, // Assign the specific draw function
    };
    gameActive = true;
    // updateUIState() called by gameLoop
  }

  function updateProjectile() {
    if (!projectile || !projectile.active) return;

    projectile.x += projectile.vx;
    projectile.y += projectile.vy;
    projectile.vy += GRAVITY;
    projectile.vx += currentWind;

    const terrainAtProjectileX = findTerrainY(projectile.x);
    // Use projectile.radius for terrain collision
    if (projectile.y + projectile.radius >= terrainAtProjectileX) {
      // Adjusted collision point
      projectile.y = terrainAtTerrainX - projectile.radius; // Adjusted final position above terrain
      projectile.active = false;
      endTurn();
      return;
    }

    const opponentIndex = currentPlayerIndex === 0 ? 1 : 0;
    const opponent = players[opponentIndex];

    let hitDamage = 0;
    let hitPart = null;

    // Use projectile.radius for player collision checks
    const distHead = Math.sqrt(
      Math.pow(projectile.x - opponent.x, 2) +
        Math.pow(projectile.y - opponent.headY, 2),
    );
    if (distHead < HEAD_RADIUS + projectile.radius) {
      // Use projectile.radius
      hitDamage = DAMAGE_HEAD;
      hitPart = "head";
    } else {
      const distBody = Math.sqrt(
        Math.pow(projectile.x - opponent.x, 2) +
          Math.pow(projectile.y - opponent.bodyY, 2),
      );
      if (distBody < BODY_HEIGHT / 2 + projectile.radius) {
        // Use projectile.radius
        hitDamage = DAMAGE_BODY;
        hitPart = "body";
      } else {
        const distLegs = Math.sqrt(
          Math.pow(projectile.x - opponent.x, 2) +
            Math.pow(projectile.y - opponent.legsY, 2),
        );
        if (distLegs < LEG_LENGTH / 2 + projectile.radius) {
          // Use projectile.radius
          hitDamage = DAMAGE_LEGS;
          hitPart = "legs";
        }
      }
    }

    if (hitPart) {
      projectile.active = false;
      opponent.takeDamage(hitDamage);
      opponent.applyKnockback(projectile.firedPower);
      checkGameOver();
      endTurn();
      return;
    }

    // Projectile off-screen check - adjusted bounds slightly based on radius
    if (
      projectile.x < -projectile.radius * 2 ||
      projectile.x > canvas.width + projectile.radius * 2
    ) {
      // Use projectile.radius
      projectile.active = false;
      endTurn();
      return;
    }
  }

  function endTurn() {
    gameActive = false;

    if (!gameOver) {
      if (players.some((p) => p.isKnockingBack)) {
        requestAnimationFrame(endTurn);
        return;
      }

      currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
      getRandomWind();
      // updateUIState() will be called by gameLoop, no explicit call here
    }
  }

  function checkGameOver() {
    let winner = null;
    if (players[0].health <= 0) {
      winner = players[1];
    } else if (players[1].health <= 0) {
      winner = players[0];
    }

    if (winner) {
      gameOver = true;
      gameOverMessage.textContent = `${winner.id === 1 ? "Player 1 (Red)" : "Player 2 (Blue)"} Wins!`;
      gameOverScreen.style.display = "flex";
      // updateUIState() will be called by gameLoop, no explicit call here
    }
  }

  // --- Main Game Loop ---
  function gameLoop() {
    players.forEach((p) => p.updateKnockback());

    if (gameActive) {
      updateProjectile();
    }

    // Always update UI state to reflect game state (e.g., button disabled, slider values)
    updateUIState();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawTerrain();
    players.forEach((player) => player.draw());
    drawProjectile();
    drawTrajectory();
    drawUI(); // Draw all UI elements on top

    requestAnimationFrame(gameLoop);
  }

  // --- Canvas Mouse Event Handlers ---

  // Helper to get mouse position corrected for canvas scaling
  function getMousePos(event) {
    const rect = canvas.getBoundingClientRect(); // Get the canvas's position and size relative to the viewport
    const scaleX = canvas.width / rect.width; // Calculate scaling factor for X
    const scaleY = canvas.height / rect.height; // Calculate scaling factor for Y

    return {
      x: (event.clientX - rect.left) * scaleX, // Adjust event coordinates by subtracting canvas's top-left corner
      y: (event.clientY - rect.top) * scaleY, // and then multiplying by the scale factor
    };
  }

  // Helper to check if a point is within a rectangle
  function isPointInRect(px, py, rect) {
    return (
      px >= rect.x &&
      px <= rect.x + rect.width &&
      py >= rect.y &&
      py <= rect.y + rect.height
    );
  }

  canvas.addEventListener("mousedown", (e) => {
    const mousePos = getMousePos(e);
    const mouseX = mousePos.x;
    const mouseY = mousePos.y;

    // 1. Check Fire Button
    if (isPointInRect(mouseX, mouseY, uiElements.fireButton)) {
      if (!uiElements.fireButton.disabled) {
        fireProjectile();
        return; // Stop processing further interactions
      }
    }

    // 2. Check Sliders for interaction
    for (const key in uiElements) {
      const element = uiElements[key];
      // Only consider interactive sliders that are not disabled
      if (element.type === "slider" && !element.disabled) {
        // Calculate the interaction area for the slider, which includes the thumb
        // Make it slightly larger than the track for easier clicking
        const interactiveRect = {
          x: element.x - SLIDER_THUMB_RADIUS,
          y: element.y - SLIDER_THUMB_RADIUS,
          width: element.width + 2 * SLIDER_THUMB_RADIUS,
          height: element.height + 2 * SLIDER_THUMB_RADIUS,
        };

        if (isPointInRect(mouseX, mouseY, interactiveRect)) {
          isDragging = true;
          selectedSlider = element; // Store the *reference* to the UI element
          updateSliderValue(mouseX); // Update value immediately on click
          return; // Stop processing further interactions
        }
      }
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    const mousePos = getMousePos(e);
    mouse.x = mousePos.x;
    mouse.y = mousePos.y;

    if (isDragging && selectedSlider) {
      updateSliderValue(mouse.x);
    }
  });

  canvas.addEventListener("mouseup", () => {
    if (isDragging && selectedSlider) {
      // If the released slider was a game setup slider, re-initialize the game
      // This ensures terrain/player positions update only AFTER the drag is complete
      if (
        selectedSlider.id === "distance" ||
        selectedSlider.id === "hilliness"
      ) {
        initializeGame(); // This will apply the new settings
      }
    }
    isDragging = false;
    selectedSlider = null; // Clear selected slider reference
  });

  // Helper to update a slider's value based on mouse X position
  function updateSliderValue(mouseX) {
    if (selectedSlider) {
      // Calculate new value based on mouseX relative to slider's x position
      let percentage = (mouseX - selectedSlider.x) / selectedSlider.width;
      let newValue =
        percentage * (selectedSlider.max - selectedSlider.min) +
        selectedSlider.min;

      // Clamp value to slider's min/max range
      newValue = Math.max(
        selectedSlider.min,
        Math.min(selectedSlider.max, newValue),
      );

      // Round to integer value for clean display
      selectedSlider.value = Math.round(newValue);

      // For player angle/power, the player objects' properties are updated
      // by `updateUIState()` in the `gameLoop` which reads from `uiElements` values.
      // So no direct updates needed here.
    }
  }

  // Restart button event listener (this is still on the HTML button)
  restartButton.addEventListener("click", initializeGame);

  // Initial setup and start game loop
  initializeGame();
  gameLoop();
});
