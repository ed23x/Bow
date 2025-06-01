document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const restartButton = document.getElementById("restartButton");
  const gameOverScreen = document.getElementById("gameOverScreen");
  const gameOverMessage = document.getElementById("gameOverMessage");

  // Get references to the new HTML input elements
  const playerDistanceInput = document.getElementById("playerDistance");
  const terrainHillinessInput = document.getElementById("terrainHilliness");

  // --- Game Constants ---
  const GRAVITY = 0.2;
  const MAX_HEALTH = 100;
  const POWER_MULTIPLIER = 0.3; // Base multiplier for projectile velocity
  const WIND_MAX_FORCE = 0.05;

  // Player body constants (Base values before scaling)
  const BASE_HEAD_RADIUS = 8;
  const BASE_BODY_HEIGHT = 25;
  const BASE_LEG_LENGTH = 15;
  const BASE_PLAYER_DRAW_OFFSET = 5; // How much above the terrain the "feet" are drawn (to avoid being in terrain)

  // Damage constants (Note: Damage amounts are independent of projectile type for simplicity)
  const DAMAGE_HEAD = 40;
  const DAMAGE_BODY = 25;
  const DAMAGE_LEGS = 15;

  // Knockback constants
  const KNOCKBACK_POWER_MULTIPLIER = 0.8;
  const KNOCKBACK_ANIMATION_FRAMES = 20;

  // Terrain constants (Base values before scaling)
  const BASE_TERRAIN_SEGMENT_WIDTH = 20;
  const MIN_TERRAIN_Y_PERCENT = 0.4; // Minimum Y for terrain as percentage of canvas height
  const MAX_TERRAIN_Y_OFFSET = 10; // Maximum Y for terrain as offset from canvas height
  const TRAJECTORY_MAX_SIM_STEPS = 500;
  const TRAJECTORY_PREVIEW_FRACTION = 1 / 3; // How much of the distance to the opponent to preview

  // --- UI Elements Configuration (Canvas-drawn only) ---
  const UI_PADDING = 15;
  const INFO_TEXT_SIZE = 16;
  const HEALTH_BAR_WIDTH = 150;
  const HEALTH_BAR_HEIGHT = 20;
  const HEALTH_BAR_VERTICAL_MARGIN = 5; // Margin between the player name text and the health bar

  // Constants for the new aiming mechanic
  const MAX_DRAG_DISTANCE = 200; // Max pixel distance to drag for full power (Increased for larger screen)
  const MIN_FIRE_DRAG_DISTANCE = 5; // Minimum drag distance to register a shot on mouseup
  const AIM_DISPLAY_Y_OFFSET = 20; // Offset above the player's head for the aim display

  // --- Projectile Definitions (Base values before scaling) ---
  const PROJECTILE_TYPES = [
    {
      type: "arrow",
      baseRadius: 5,
      draw: (ctx, proj) => {
        // Arrow drawing logic using scaled projectile properties
        ctx.fillStyle = "#7f8c8d";
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 1 * proj.scaleFactor; // Scale line width
        const arrowLength = 15 * proj.scaleFactor; // Scale length
        const headLength = 7 * proj.scaleFactor; // Scale head length
        const headWidth = 5 * proj.scaleFactor; // Scale head width
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
      baseRadius: 8,
      draw: (ctx, proj) => {
        ctx.fillStyle = "#34495e"; // Dark grey/black
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2); // Use scaled radius
        ctx.fill();
      },
    },
    {
      type: "watermelon",
      baseRadius: 7,
      draw: (ctx, proj) => {
        // Outer green rind (using scaled radius)
        ctx.fillStyle = "#2ecc71"; // Green
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
        ctx.fill();
        // Inner red (using scaled radius)
        ctx.fillStyle = "#e74c3c"; // Red
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, proj.radius * 0.7, 0, Math.PI * 2); // Scale inner red as well
        ctx.fill();
      },
    },
  ];

  // Define properties for drawing and interacting with UI elements (Canvas-drawn only)
  let uiElements = {
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
      x: 0, // Will be calculated based on canvas width
      textY: UI_PADDING + 5, // Y position for the text (5px from top)
      barY: UI_PADDING + 5 + INFO_TEXT_SIZE + HEALTH_BAR_VERTICAL_MARGIN, // Y position for the health bar rectangle (below text)
      width: HEALTH_BAR_WIDTH,
      height: HEALTH_BAR_HEIGHT,
      value: 100,
      color: "#3498db",
    },
    turnIndicator: {
      x: 0, // Will be calculated based on canvas width
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
      x: 0, // Will be calculated based on canvas width
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
    // Add displays for current angle and power during aiming
    aimDisplay: {
      x: 0, // Will be positioned relative to the player
      y: 0, // Will be positioned relative to the player
      text: "",
      color: "#ecf0f1",
      type: "text",
      visible: false, // Only visible when aiming
    },
  };

  // --- Game State Variables (Declared once globally in this scope) ---
  let players = [];
  let currentPlayerIndex = 0;
  let projectile = null;
  let gameActive = false; // True when projectile is in flight
  let gameOver = false;
  let currentWind = 0;
  let terrain = [];

  // Dynamic game settings (now controlled by text inputs)
  let currentTerrainMaxHeightChange =
    parseFloat(terrainHillinessInput.value) || 15;
  let currentPlayerDistancePercent =
    parseFloat(playerDistanceInput.value) || 70;

  // Scaling factor based on player distance - Initial calculation
  const REFERENCE_DISTANCE_PERCENT = 70; // Distance percentage at which drawing is 1:1
  let scaleFactor = REFERENCE_DISTANCE_PERCENT / currentPlayerDistancePercent;

  // Mouse interaction variables for drag-to-aim
  let isAiming = false; // Flag for aiming drag
  let mouse = { x: 0, y: 0 }; // Keep track of mouse position
  let aimStartPoint = { x: 0, y: 0 }; // Player's position (scaled) when aiming started

  // --- Player Class ---
  class Player {
    constructor(id, color) {
      this.id = id;
      this.color = color;
      this.x = 0;
      this.health = MAX_HEALTH;
      this.direction = id === 1 ? 1 : -1; // 1 for Player 1 (right), -1 for Player 2 (left)

      // currentAngle is now the calculated angle from drag, used for velocity (in radians, absolute)
      this.currentAngle = id === 1 ? 0 : Math.PI; // Default angle: horizontal forward
      this.currentPower = 0; // Default power: 0

      this.isKnockingBack = false;
      this.knockbackStartX = 0;
      this.knockbackTargetX = 0;
      this.knockbackFrames = 0;
    }

    // Scaled dimensions
    get headRadius() {
      return BASE_HEAD_RADIUS * scaleFactor;
    }
    get bodyHeight() {
      return BASE_BODY_HEIGHT * scaleFactor;
    }
    get legLength() {
      return BASE_LEG_LENGTH * scaleFactor;
    }
    get drawOffset() {
      return BASE_PLAYER_DRAW_OFFSET * scaleFactor;
    }

    get base_y() {
      return findTerrainY(this.x);
    }
    get headY() {
      // Use scaled dimensions
      return (
        this.base_y -
        (this.legLength + this.bodyHeight + this.headRadius + this.drawOffset)
      );
    }
    get bodyY() {
      // Use scaled dimensions
      return (
        this.base_y - (this.legLength + this.bodyHeight / 2 + this.drawOffset)
      );
    }
    get legsY() {
      // Use scaled dimensions
      return this.base_y - (this.legLength / 2 + this.drawOffset);
    }

    draw() {
      ctx.fillStyle = this.color;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2 * scaleFactor; // Scale line width

      // Head (using scaled radius)
      ctx.beginPath();
      ctx.arc(this.x, this.headY, this.headRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Body (using scaled dimensions)
      ctx.beginPath();
      ctx.moveTo(this.x, this.headY + this.headRadius);
      ctx.lineTo(this.x, this.base_y - this.legLength - this.drawOffset);
      ctx.stroke();

      // Legs (using scaled dimensions)
      ctx.beginPath();
      ctx.moveTo(this.x, this.base_y - this.legLength - this.drawOffset);
      ctx.lineTo(this.x - this.headRadius, this.base_y - this.drawOffset);
      ctx.moveTo(this.x, this.base_y - this.legLength - this.drawOffset);
      ctx.lineTo(this.x + this.headRadius, this.base_y - this.drawOffset);
      ctx.stroke();

      // Cannon/Arm - Draw only if not currently aiming
      if (!isAiming) {
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 5 * scaleFactor; // Scale line width
        ctx.beginPath();
        // Calculate arm angle based on stored currentAngle (absolute radians)
        const armAngleRad = this.currentAngle; // Use the stored angle directly

        const armLength = this.headRadius * 2; // Scale arm length
        // Start point is near the shoulder/base of the cannon (scaled)
        const armStartX = this.x + this.direction * this.headRadius * 0.5;
        const armStartY = this.headY + this.headRadius / 2;

        // End point is calculated based on the arm angle and arm length
        const armEndX = armStartX + Math.cos(armAngleRad) * armLength;
        const armEndY = armStartY + Math.sin(armAngleRad) * armLength; // Use sin directly for Y component
        ctx.moveTo(armStartX, armStartY);
        ctx.lineTo(armEndX, armEndY);
        ctx.stroke();
      }
    }

    takeDamage(amount) {
      this.health -= amount;
      if (this.health < 0) this.health = 0;
      uiElements.player1HealthBar.value = players[0].health;
      uiElements.player2HealthBar.value = players[1].health;
    }

    applyKnockback(projectilePower) {
      const knockbackDirection = this.id === 1 ? -1 : 1;
      // Scale knockback distance
      const actualKnockbackDistance =
        projectilePower * KNOCKBACK_POWER_MULTIPLIER * scaleFactor;

      this.knockbackStartX = this.x;
      this.knockbackTargetX =
        this.x + knockbackDirection * actualKnockbackDistance;

      // Ensure knockback target respects scaled player width and canvas boundaries
      const playerVisualHalfWidth = this.headRadius;
      this.knockbackTargetX = Math.max(
        playerVisualHalfWidth + UI_PADDING, // Respect UI padding
        Math.min(
          canvas.width - playerVisualHalfWidth - UI_PADDING,
          this.knockbackTargetX,
        ), // Respect UI padding
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
        // Ensure player is on the terrain after knockback
        this.x = Math.max(
          this.headRadius + UI_PADDING,
          Math.min(canvas.width - this.headRadius - UI_PADDING, this.x),
        );
      }
    }
  }

  // --- Utility Functions ---
  function toRadians(angle) {
    return angle * (Math.PI / 180);
  }
  function toDegrees(angle) {
    return angle * (180 / Math.PI);
  }
  function lerp(start, end, progress) {
    return start * (1 - progress) + end * progress;
  }

  function getRandomWind() {
    currentWind = (Math.random() * 2 - 1) * WIND_MAX_FORCE;
    uiElements.windInfo.text = `Wind: ${currentWind.toFixed(2)} m/s ${currentWind > 0 ? "→" : currentWind < 0 ? "←" : ""}`;
    // Position wind info text based on current canvas width
    uiElements.windInfo.x = canvas.width / 2;
  }

  // --- Terrain Generation ---
  function generateTerrain() {
    terrain = [];
    // Terrain base Y is now fixed relative to canvas height
    const terrainBaseY = canvas.height - 30;

    let currentY = terrainBaseY;
    let x = 0;

    terrain.push({ x: 0, y: currentY });

    // Use scaled segment width
    const scaledTerrainSegmentWidth = BASE_TERRAIN_SEGMENT_WIDTH * scaleFactor;

    while (x < canvas.width) {
      x += scaledTerrainSegmentWidth;
      // Use scaled terrain height change
      currentY +=
        (Math.random() * 2 - 1) * (currentTerrainMaxHeightChange * scaleFactor);
      // Clamp Y between scaled min and max Y based on canvas height
      currentY = Math.max(
        canvas.height * MIN_TERRAIN_Y_PERCENT,
        Math.min(canvas.height - MAX_TERRAIN_Y_OFFSET, currentY),
      );
      terrain.push({ x: x, y: currentY });
    }
    // Ensure the last point extends to the canvas width
    if (terrain[terrain.length - 1].x < canvas.width) {
      terrain.push({ x: canvas.width, y: currentY });
    }
  }

  // Function to update game settings from input fields and re-initialize relevant parts
  function updateGameSettings() {
    // Parse input values, default to original values if invalid
    const newHilliness = parseFloat(terrainHillinessInput.value);
    const newDistance = parseFloat(playerDistanceInput.value);

    // Basic validation/clamping
    // Ensure values are numbers and non-negative. Clamp hilliness to a reasonable max.
    currentTerrainMaxHeightChange =
      isNaN(newHilliness) || newHilliness < 0
        ? 15
        : Math.min(newHilliness, 200); // Increased max hilliness
    // Clamp distance to a practical range (e.g., 10% to 200% of canvas width, allowing larger distances)
    currentPlayerDistancePercent =
      isNaN(newDistance) || newDistance < 10 || newDistance > 200
        ? 70
        : newDistance;

    // Update the input fields with potentially corrected/clamped values for user feedback
    terrainHillinessInput.value = currentTerrainMaxHeightChange;
    playerDistanceInput.value = currentPlayerDistancePercent;

    // Recalculate the scale factor based on the new distance
    scaleFactor = REFERENCE_DISTANCE_PERCENT / currentPlayerDistancePercent;

    // Regenerate terrain and reposition players based on new settings and scale
    generateTerrain();

    const distance = canvas.width * (currentPlayerDistancePercent / 100);
    players[0].x = canvas.width / 2 - distance / 2;
    players[1].x = canvas.width / 2 + distance / 2;

    // Ensure players are positioned correctly, respecting scaled size and canvas boundaries
    const playerVisualHalfWidth = players[0].headRadius; // Use scaled width
    players[0].x = Math.max(
      playerVisualHalfWidth + UI_PADDING,
      Math.min(canvas.width / 2 - distance / 2, players[0].x),
    );
    players[1].x = Math.max(
      canvas.width / 2 + distance / 2,
      Math.min(canvas.width - playerVisualHalfWidth - UI_PADDING, players[1].x),
    );

    // If game is not active or aiming, reset turn and projectile
    if (
      !gameOver &&
      !gameActive &&
      !isAiming &&
      !players.some((p) => p.isKnockingBack)
    ) {
      currentPlayerIndex = 0;
      projectile = null;
      getRandomWind(); // Get new wind after settings change
      updateUIState(); // Update UI elements positions/visibility
    }
    // If game is active or aiming, settings changes will apply to the *next* round/shot.
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
    // Scale sun size and position slightly
    ctx.arc(
      canvas.width * 0.8,
      canvas.height * 0.2,
      30 * scaleFactor,
      0,
      Math.PI * 2,
    );
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
    // Call the draw function specific to the projectile type, passing the scaled projectile data
    const scaledProjectile = {
      x: projectile.x,
      y: projectile.y,
      vx: projectile.vx,
      vy: projectile.vy,
      radius: projectile.radius, // This is already stored as the scaled radius
      scaleFactor: scaleFactor, // Pass scale factor to draw function if needed for line widths etc.
    };
    projectile.draw(ctx, scaledProjectile);
  }

  function drawTrajectory() {
    // Only draw trajectory if it's the current player's turn, game is not active,
    // no one is knocking back, and we are currently aiming
    if (
      currentPlayerIndex !== -1 &&
      !gameActive &&
      !gameOver &&
      !players.some((p) => p.isKnockingBack) &&
      isAiming
    ) {
      const player = players[currentPlayerIndex];
      // Use the stored currentAngle (in radians, absolute) and currentPower (0-100)
      const angleRad = player.currentAngle;
      const power = player.currentPower;

      let tempX = player.x;
      // Start point near cannon (scaled)
      let tempY = player.headY + (BASE_HEAD_RADIUS / 2) * scaleFactor;
      // Calculate initial velocities using the absolute angle and power, scaled by POWER_MULTIPLIER
      let tempVx = Math.cos(angleRad) * power * POWER_MULTIPLIER;
      let tempVy = Math.sin(angleRad) * power * POWER_MULTIPLIER;

      // Calculate the target X position for the trajectory preview: 1/3 of the way to the opponent
      const opponent = players[(currentPlayerIndex + 1) % players.length];
      const targetPreviewX =
        player.x + (opponent.x - player.x) * TRAJECTORY_PREVIEW_FRACTION;

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

        // Stop drawing if hits terrain, goes off screen vertically, or crosses the target preview X position
        let stopDrawing = false;
        if (
          tempY >= terrainAtTempX ||
          tempY > canvas.height + 100 ||
          tempY < -100
        ) {
          stopDrawing = true; // Stop if hits terrain or goes off screen vertically
        }

        // Check if the trajectory has passed the target preview X position
        if (player.direction === 1) {
          // Player 1 (right)
          if (tempX >= targetPreviewX) stopDrawing = true;
        } else {
          // Player 2 (left)
          if (tempX <= targetPreviewX) stopDrawing = true;
        }

        if (stopDrawing) {
          ctx.lineTo(tempX, tempY); // Draw the last point before stopping
          break;
        }
        ctx.lineTo(tempX, tempY);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // --- Drawing UI Elements on Canvas ---

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

  // Main UI drawing function (Canvas-drawn UI only)
  function drawUI() {
    // Reposition UI elements based on current canvas size
    uiElements.player2HealthBar.x =
      canvas.width - UI_PADDING - uiElements.player2HealthBar.width;
    uiElements.turnIndicator.x = canvas.width / 2;
    uiElements.windInfo.x = canvas.width / 2;

    // Draw Health Bars
    drawHealthBar(uiElements.player1HealthBar, players[0].health);
    drawHealthBar(uiElements.player2HealthBar, players[1].health);

    // Draw Turn Indicator and Wind Info
    drawInfoText(uiElements.turnIndicator);
    drawInfoText(uiElements.windInfo);

    // Draw aim display if visible
    if (uiElements.aimDisplay.visible) {
      const player = players[currentPlayerIndex];
      // Display angle in degrees, rounded to 1 decimal place
      // The player.currentAngle is already the absolute angle in radians.
      // We convert it to degrees for display.
      let displayAngle = toDegrees(player.currentAngle);

      // Normalize display angle to -180 to 180 range for easier interpretation
      while (displayAngle <= -180) displayAngle += 360;
      while (displayAngle > 180) displayAngle -= 360;

      const power = Math.round(player.currentPower);
      uiElements.aimDisplay.text = `Angle: ${displayAngle.toFixed(1)}° | Power: ${power}`;

      uiElements.aimDisplay.visible = true;
      // Position the aim display relative to the current player (scaled head position)
      uiElements.aimDisplay.x = player.x;
      uiElements.aimDisplay.y =
        player.headY - player.headRadius - AIM_DISPLAY_Y_OFFSET; // Position above the player's head, using scaled headRadius
    } else {
      uiElements.aimDisplay.visible = false;
    }
  }

  // --- Canvas/Window Resize Handling ---
  function resizeCanvas() {
    // Update canvas dimensions to match its actual size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Re-initialize the game state to adapt to the new canvas size
    // This will regenerate terrain, reposition players, and recalculate scaling.
    initializeGame();
  }

  // --- Game Logic Functions ---
  function initializeGame() {
    gameOver = false;
    gameOverScreen.style.display = "none";

    // Get initial settings from the text inputs, validate and clamp
    const initialHilliness = parseFloat(terrainHillinessInput.value);
    const initialDistance = parseFloat(playerDistanceInput.value);

    currentTerrainMaxHeightChange =
      isNaN(initialHilliness) || initialHilliness < 0
        ? 15
        : Math.min(initialHilliness, 200); // Clamp hilliness
    currentPlayerDistancePercent =
      isNaN(initialDistance) || initialDistance < 10 || initialDistance > 200
        ? 70
        : initialDistance; // Clamp distance

    terrainHillinessInput.value = currentTerrainMaxHeightChange;
    playerDistanceInput.value = currentPlayerDistancePercent;

    // Calculate initial scale factor based on current canvas width and distance
    // We use a reference percentage of the current canvas width for scaling baseline
    scaleFactor =
      (canvas.width * (REFERENCE_DISTANCE_PERCENT / 100)) /
      (canvas.width * (currentPlayerDistancePercent / 100));
    scaleFactor = REFERENCE_DISTANCE_PERCENT / currentPlayerDistancePercent; // Simplified calculation

    generateTerrain();

    players = [new Player(1, "#e74c3c"), new Player(2, "#3498db")];

    const distance = canvas.width * (currentPlayerDistancePercent / 100);
    players[0].x = canvas.width / 2 - distance / 2;
    players[1].x = canvas.width / 2 + distance / 2;

    // Ensure players are positioned correctly, respecting scaled size and canvas boundaries
    const playerVisualHalfWidth = players[0].headRadius; // Use scaled width
    players[0].x = Math.max(
      playerVisualHalfWidth + UI_PADDING,
      Math.min(canvas.width / 2 - distance / 2, players[0].x),
    );
    players[1].x = Math.max(
      canvas.width / 2 + distance / 2,
      Math.min(canvas.width - playerVisualHalfWidth - UI_PADDING, players[1].x),
    );

    // Set default aiming angles based on player direction
    players[0].currentAngle = 0; // Horizontal right
    players[1].currentAngle = Math.PI; // Horizontal left

    currentPlayerIndex = 0;
    projectile = null;
    gameActive = false;
    isAiming = false; // Reset aiming state

    getRandomWind();
    updateUIState(); // Update the internal state of UI elements
  }

  // Updates the internal state of UI elements (e.g., their 'visible' property)
  function updateUIState() {
    const currentPlayer = players[currentPlayerIndex];
    const isAnyPlayerKnockingBack = players.some((p) => p.isKnockingBack);

    // Text inputs are handled separately via their own event listeners.
    // We only need to manage disabling them while game is active or over or aiming or knocking back.
    const disableSetupInputs =
      gameActive || gameOver || isAiming || isAnyPlayerKnockingBack;
    playerDistanceInput.disabled = disableSetupInputs;
    terrainHillinessInput.disabled = disableSetupInputs;

    // --- Update visual values for UI elements (Health Bars, Turn Indicator, Aim Display) ---
    uiElements.player1HealthBar.value = players[0].health;
    uiElements.player2HealthBar.value = players[1].health;
    uiElements.turnIndicator.text = `${currentPlayer.id === 1 ? "Player 1 (Red)" : "Player 2 (Blue)"}'s Turn`;

    // Update Aim Display text and visibility
    if (isAiming) {
      const player = players[currentPlayerIndex];
      // Display angle in degrees, rounded to 1 decimal place
      // The player.currentAngle is already the absolute angle in radians.
      // We convert it to degrees for display.
      let displayAngle = toDegrees(player.currentAngle);

      // Normalize display angle to -180 to 180 range for easier interpretation
      while (displayAngle <= -180) displayAngle += 360;
      while (displayAngle > 180) displayAngle -= 360;

      const power = Math.round(player.currentPower);
      uiElements.aimDisplay.text = `Angle: ${displayAngle.toFixed(1)}° | Power: ${power}`;

      uiElements.aimDisplay.visible = true;
      // Position the aim display relative to the current player (scaled head position)
      uiElements.aimDisplay.x = player.x;
      uiElements.aimDisplay.y =
        player.headY - player.headRadius - AIM_DISPLAY_Y_OFFSET; // Position above the player's head, using scaled headRadius
    } else {
      uiElements.aimDisplay.visible = false;
    }
  }

  function fireProjectile() {
    // Firing is triggered by mouseup after aiming.
    // This function creates and launches the projectile based on the player's current angle (in radians) and power.

    const player = players[currentPlayerIndex];
    const angleRad = player.currentAngle; // Use stored angle in radians (absolute)
    const power = player.currentPower; // Use power 0-100

    // Calculate initial velocities using the absolute angle and power, scaled by POWER_MULTIPLIER
    const initialVx = Math.cos(angleRad) * power * POWER_MULTIPLIER;
    const initialVy = Math.sin(angleRad) * power * POWER_MULTIPLIER; // Use sin directly

    // Select a random projectile type
    const randomProjectileType =
      PROJECTILE_TYPES[Math.floor(Math.random() * PROJECTILE_TYPES.length)];

    projectile = {
      x: player.x,
      y: player.headY + (BASE_HEAD_RADIUS / 2) * scaleFactor, // Start projectile near the cannon/arm (scaled)
      vx: initialVx,
      vy: initialVy,
      active: true,
      firedPower: power,
      // Assign properties from the selected type
      type: randomProjectileType.type,
      radius: randomProjectileType.baseRadius * scaleFactor, // Store the SCALED radius
      draw: randomProjectileType.draw, // Assign the specific draw function
      scaleFactor: scaleFactor, // Store the scale factor with the projectile
    };
    gameActive = true;
    isAiming = false; // Stop aiming after firing
    // updateUIState() called by gameLoop
  }

  function updateProjectile() {
    if (!projectile || !projectile.active) return;

    projectile.x += projectile.vx;
    projectile.y += projectile.vy;
    projectile.vy += GRAVITY;
    projectile.vx += currentWind;

    const terrainAtProjectileX = findTerrainY(projectile.x);
    // Use projectile.radius (which is already scaled) for terrain collision
    if (projectile.y + projectile.radius >= terrainAtProjectileX) {
      // Adjusted collision point
      projectile.y = terrainAtProjectileX - projectile.radius; // Adjusted final position above terrain
      projectile.active = false;
      endTurn();
      return;
    }

    const opponentIndex = currentPlayerIndex === 0 ? 1 : 0;
    const opponent = players[opponentIndex];

    let hitDamage = 0;
    let hitPart = null;

    // Use scaled player part dimensions and projectile radius for collision checks

    // Check collision with Head (circle-to-circle)
    const scaledHeadRadius = opponent.headRadius;
    const distHead = Math.sqrt(
      Math.pow(projectile.x - opponent.x, 2) +
        Math.pow(projectile.y - opponent.headY, 2),
    );
    if (distHead < scaledHeadRadius + projectile.radius) {
      hitDamage = DAMAGE_HEAD;
      hitPart = "head";
    }
    // Check collision with Body (simple approach: AABB check with scaled player's body bounding box)
    const scaledBodyTop = opponent.headY + opponent.headRadius;
    const scaledBodyBottom =
      opponent.base_y - opponent.legLength - opponent.drawOffset;
    const scaledBodyLeft = opponent.x - opponent.headRadius; // Approximate scaled body width
    const scaledBodyRight = opponent.x + opponent.headRadius; // Approximate scaled body width

    if (
      !hitPart &&
      projectile.x + projectile.radius > scaledBodyLeft &&
      projectile.x - projectile.radius < scaledBodyRight &&
      projectile.y + projectile.radius > scaledBodyTop &&
      projectile.y - projectile.radius < scaledBodyBottom
    ) {
      hitDamage = DAMAGE_BODY;
      hitPart = "body";
    }

    // Check collision with Legs (simple approach: check two circles at scaled leg positions)
    const scaledLegLeftX = opponent.x - opponent.headRadius;
    const scaledLegRightX = opponent.x + opponent.headRadius;
    const scaledLegY =
      opponent.base_y - opponent.legLength / 2 - opponent.drawOffset; // Mid-point of legs (scaled)

    const distLegLeft = Math.sqrt(
      Math.pow(projectile.x - scaledLegLeftX, 2) +
        Math.pow(projectile.y - scaledLegY, 2),
    );
    const distLegRight = Math.sqrt(
      Math.pow(projectile.x - scaledLegRightX, 2) +
        Math.pow(projectile.y - scaledLegY, 2),
    );

    if (
      !hitPart &&
      (distLegLeft < opponent.legLength / 2 + projectile.radius ||
        distLegRight < opponent.legLength / 2 + projectile.radius)
    ) {
      // Also ensure projectile is below the body area to count as leg hit
      if (projectile.y > scaledBodyBottom) {
        hitDamage = DAMAGE_LEGS;
        hitPart = "legs";
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

    // Projectile off-screen check - adjusted bounds slightly based on projectile radius
    if (
      projectile.x < -canvas.width / 2 ||
      projectile.x > canvas.width * 1.5 ||
      projectile.y > canvas.height + projectile.radius * 2
    ) {
      // Check if it falls off the bottom
      projectile.active = false;
      endTurn();
      return;
    }
  }

  function endTurn() {
    gameActive = false;
    isAiming = false; // Ensure aiming is off when turn ends

    if (!gameOver) {
      // Wait for knockback animation to finish before switching turns
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
    // Update knockback animation for both players
    players.forEach((p) => p.updateKnockback());

    // If game is active (projectile is flying), update projectile position
    if (gameActive) {
      updateProjectile();
    }

    // Always update UI state to reflect game state (e.g., button disabled, slider values)
    updateUIState();

    // Clear canvas and redraw everything
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawTerrain();
    players.forEach((player) => player.draw());
    drawProjectile(); // Draw projectile if active
    drawTrajectory(); // Draw trajectory if aiming
    drawUI(); // Draw all UI elements on top

    // Request next frame
    requestAnimationFrame(gameLoop);
  }

  // --- Canvas Mouse Event Handlers (using document for drag capture) ---

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

  // Event handlers attached to the document for capturing mouse movement outside the canvas
  function handleDocumentMouseMove(e) {
    // Only process if we are currently aiming
    if (!isAiming) return;

    const mousePos = getMousePos(e);
    mouse.x = mousePos.x;
    mouse.y = mousePos.y;

    const player = players[currentPlayerIndex];

    // Calculate the vector from the player's aiming start point to the current mouse position
    // This vector points in the direction of the drag relative to the player.
    const dragVectorX = mouse.x - aimStartPoint.x;
    const dragVectorY = mouse.y - aimStartPoint.y;

    // Calculate drag distance
    let dragDistance = Math.sqrt(
      Math.pow(dragVectorX, 2) + Math.pow(dragVectorY, 2),
    );

    // Clamp drag distance to MAX_DRAG_DISTANCE for power calculation (0 to 100)
    const clampedDragDistance = Math.min(MAX_DRAG_DISTANCE, dragDistance);
    player.currentPower = Math.round(
      (clampedDragDistance / MAX_DRAG_DISTANCE) * 100,
    );
    player.currentPower = Math.max(0, player.currentPower); // Ensure power is not negative

    // Calculate the angle of the shot vector (opposite of drag vector) relative to the positive X axis.
    // Shot vector: (aimStartPoint.x - mouse.x, aimStartPoint.y - mouse.y)
    const shotVectorX = aimStartPoint.x - mouse.x;
    const shotVectorY = aimStartPoint.y - mouse.y;

    // Calculate the absolute angle of the shot vector in radians using atan2(y, x)
    // This angle is relative to the positive X axis of the canvas.
    let absoluteShotAngleRad = Math.atan2(shotVectorY, shotVectorX);

    // Store the absolute angle in radians in player.currentAngle
    player.currentAngle = absoluteShotAngleRad;

    updateUIState(); // Update UI to show new angle/power and trajectory preview
  }

  function handleDocumentMouseUp(e) {
    // Only process if we were currently aiming
    if (!isAiming) return;

    const mousePos = getMousePos(e);
    mouse.x = mousePos.x;
    mouse.y = mousePos.y;

    // Only fire if the drag had some minimal distance to avoid accidental clicks
    const dragDistance = Math.sqrt(
      Math.pow(mouse.x - aimStartPoint.x, 2) +
        Math.pow(mouse.y - aimStartPoint.y, 2),
    );

    // Check game state before firing
    if (
      dragDistance > MIN_FIRE_DRAG_DISTANCE &&
      !gameActive &&
      !gameOver &&
      !players.some((p) => p.isKnockingBack)
    ) {
      fireProjectile();
    } else {
      // If not enough drag to fire, reset player angle/power
      const currentPlayer = players[currentPlayerIndex];
      // Reset angle to face forward horizontally with 0 power
      // Angle 0 rad is positive X (right), PI rad is negative X (left)
      currentPlayer.currentAngle = currentPlayer.direction === 1 ? 0 : Math.PI;
      currentPlayer.currentPower = 0; // Reset power
    }

    isAiming = false; // Stop aiming
    updateUIState(); // Update UI state

    // Remove the document listeners after the drag/aiming is complete
    document.removeEventListener("mousemove", handleDocumentMouseMove);
    document.removeEventListener("mouseup", handleDocumentMouseUp);
  }

  canvas.addEventListener("mousedown", (e) => {
    // Check if the click target is an HTML element that we don't want to interfere with.
    // We need to check the actual DOM element at the click position.
    const targetElement = document.elementFromPoint(e.clientX, e.clientY);

    // List interactive HTML elements here
    if (
      targetElement === playerDistanceInput ||
      targetElement === terrainHillinessInput ||
      targetElement === restartButton
    ) {
      // If the click is on an interactive HTML control, let the default HTML behavior handle it.
      return;
    }

    // Get mouse position within the canvas coordinates
    const mousePos = getMousePos(e);
    mouse.x = mousePos.x;
    mouse.y = mousePos.y;

    const currentPlayer = players[currentPlayerIndex];

    // Start aiming if game is not active, game over, or knocking back
    // Clicking anywhere on the canvas that is NOT an HTML input initiates aiming
    if (!gameActive && !gameOver && !players.some((p) => p.isKnockingBack)) {
      isAiming = true;
      // Store the player's cannon/arm position (scaled) as the start point for the aim vector
      aimStartPoint.x = currentPlayer.x;
      aimStartPoint.y =
        currentPlayer.headY + (BASE_HEAD_RADIUS / 2) * scaleFactor; // Use scaled head position

      // Add document listeners for mousemove and mouseup while aiming to capture events outside canvas
      document.addEventListener("mousemove", handleDocumentMouseMove);
      document.addEventListener("mouseup", handleDocumentMouseUp);

      updateUIState(); // Update UI to reflect aiming state
      e.preventDefault(); // Prevent default canvas drag behavior (like text selection)
    }

    // No other canvas UI interaction handled on mousedown
  });

  // We no longer need mousemove and mouseup directly on the canvas for aiming,
  // as document listeners handle it. We can keep them for potential future canvas-specific interactions
  // if needed, but they would need checks to not interfere with isAiming. For now, they are redundant.
  // canvas.addEventListener("mousemove", (e) => { ... });
  // canvas.addEventListener("mouseup", () => { ... });

  // --- Event Listeners for HTML Input Fields ---
  // Use 'input' for live updates as user types, 'change' for when input is committed (Enter or focus out)
  playerDistanceInput.addEventListener("input", updateGameSettings);
  playerDistanceInput.addEventListener("change", updateGameSettings); // Also update on change for potentially non-live input types

  terrainHillinessInput.addEventListener("input", updateGameSettings);
  terrainHillinessInput.addEventListener("change", updateGameSettings); // Also update on change

  // Restart button event listener (this is still on the HTML button)
  restartButton.addEventListener("click", initializeGame);

  // --- Window Resize Listener ---
  window.addEventListener("resize", resizeCanvas);

  // Initial setup and start game loop
  resizeCanvas(); // Call resizeCanvas initially to set canvas size and initialize game
  gameLoop();
});
