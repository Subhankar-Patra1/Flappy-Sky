// --- Game Constants & Setup ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const scoreEl = document.getElementById('score-display');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const finalScoreEl = document.getElementById('final-score');
const bestScoreEl = document.getElementById('best-score');

// Game State
let frames = 0;
let score = 0;
let highScore = localStorage.getItem('flappyHighScore') || 0;
let gameState = 'START'; // Options: 'START', 'PLAYING', 'GAMEOVER'
let gameSpeed = 3; 
let autoPilot = false; 

// Responsive Scaling
let scale = 1;

// --- Audio System (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    // Browser policy: Resume context if suspended
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'jump') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(500, now + 0.1);
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } 
    else if (type === 'score') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, now);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } 
    else if (type === 'crash') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.linearRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'milestone') {
        const freqs = [523.25, 659.25, 783.99]; 
        freqs.forEach((f, i) => {
            const oscC = audioCtx.createOscillator();
            const gainC = audioCtx.createGain();
            oscC.connect(gainC);
            gainC.connect(audioCtx.destination);
            oscC.type = 'triangle';
            oscC.frequency.value = f;
            gainC.gain.setValueAtTime(0.1, now);
            gainC.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            oscC.start(now);
            oscC.stop(now + 0.4);
        });
    }
}

// --- Particle & Text System ---
let particles = [];
let floatingTexts = [];

class FloatingText {
    constructor(text, x, y) {
        this.text = text;
        this.x = x;
        this.y = y;
        this.alpha = 1;
        this.vy = -2 * scale;
        this.scale = 0.5;
    }
    update() {
        this.y += this.vy;
        this.alpha -= 0.015;
        if (this.scale < 1.2) this.scale += 0.05;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);
        ctx.scale(this.scale, this.scale);
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 3;
        ctx.font = "bold 40px 'Segoe UI'";
        ctx.textAlign = "center";
        ctx.strokeText(this.text, 0, 0);
        ctx.fillText(this.text, 0, 0);
        ctx.restore();
    }
}

class Particle {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type; // 'feather' or 'explosion'
        this.life = 1.0;
        
        if (type === 'feather') {
            this.vx = (Math.random() - 0.5) * 2 * scale;
            this.vy = (Math.random() - 0.5) * 2 * scale;
            this.size = (Math.random() * 3 + 2) * scale;
            this.color = `rgba(255, 255, 255, ${Math.random() * 0.5 + 0.5})`;
            this.decay = 0.03;
        } else {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5 * scale;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.size = (Math.random() * 5 + 3) * scale;
            this.color = `rgb(230, ${Math.floor(Math.random() * 100 + 50)}, 0)`;
            this.decay = 0.02;
        }
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
        
        if (this.type === 'feather') {
            this.vy += 0.1 * scale;
        }
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        if (this.type === 'feather') {
            ctx.rect(this.x, this.y, this.size, this.size);
        } else {
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.restore();
    }
}

function createParticles(x, y, type, count = 5) {
    for(let i=0; i<count; i++) {
        particles.push(new Particle(x, y, type));
    }
}


// --- Resizing Logic ---
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    scale = Math.min(canvas.width / 320, canvas.height / 480);
    if (scale > 1.5) scale = 1.5;
    if (scale < 0.8) scale = 0.8;
}
window.addEventListener('resize', resize);
resize();

// --- Game Objects ---

const bird = {
    x: 50,
    y: 150,
    w: 34,
    h: 24,
    radius: 12,
    velocity: 0,
    gravity: 0.25,
    jumpStrength: 4.6,
    rotation: 0,
    color: '#f1c40f', // Yellow
    wingOffset: 0,
    
            draw: function() {
                ctx.save();
                ctx.translate(this.x, this.y);
                
                // Rotation logic
                let rot = (this.velocity * 0.1); 
                if (gameState === 'START' || autoPilot) rot = 0; 
                if(rot > 0.5) rot = 0.5; 
                if(rot < -0.5) rot = -0.5; 
                ctx.rotate(rot);

                // Body
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(0, 0, this.radius * scale, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Eye
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(scale * 6, -scale * 6, scale * 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.arc(scale * 8, -scale * 6, scale * 1.5, 0, Math.PI * 2);
                ctx.fill();

                // Beak
                ctx.fillStyle = '#e67e22';
                ctx.beginPath();
                ctx.moveTo(scale * 8, scale * 2);
                ctx.lineTo(scale * 16, scale * 6);
                ctx.lineTo(scale * 8, scale * 10);
                ctx.fill();

                // Wing Animation
                let flapSpeed = (gameState === 'START' || autoPilot) ? 0.15 : 0.25; 
                if (gameState === 'GAMEOVER') flapSpeed = 0; 

                let flapRange = (gameState === 'START' || autoPilot) ? 3 : 5;
                this.wingOffset = Math.sin(frames * flapSpeed) * flapRange * scale;

                // Wing
                ctx.fillStyle = '#f39c12';
                ctx.beginPath();
                ctx.ellipse(-scale * 2, scale * 2 + this.wingOffset, scale * 6, scale * 4, 0.2, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
            },    update: function() {
        if (autoPilot) {
            this.y = (canvas.height / 2) + Math.sin(frames * 0.1) * (10 * scale);
            this.velocity = 0;
            
            if (pipes.items.length > 0) {
                let nextPipe = pipes.items[0];
                if (nextPipe.x - this.x < 250 * scale) {
                    autoPilot = false;
                    this.jump();
                }
            }
            return; 
        }

        this.velocity += this.gravity * scale;
        this.y += this.velocity;

        // Floor collision
        if (this.y + this.radius * scale >= canvas.height - fg.h) {
            this.y = canvas.height - fg.h - this.radius * scale;
            gameOver();
        }

        // Ceiling collision
        if (this.y - this.radius * scale <= 0) {
            this.y = this.radius * scale;
            this.velocity = 0;
        }
    },
    
    hover: function() {
        this.x = canvas.width / 3; 
        this.y = (canvas.height / 2) + Math.sin(frames * 0.05) * (15 * scale); 
        this.rotation = 0;
    },

    jump: function() {
        this.velocity = -this.jumpStrength * scale;
        playSound('jump');
        // Spawn feathers behind bird
        createParticles(this.x - 10 * scale, this.y, 'feather', 3);
    },
    
    reset: function() {
        this.x = canvas.width / 4;
        this.y = canvas.height / 2;
        this.velocity = 0;
        this.rotation = 0;
    }
};

const bg = {
    phase: 'day',
    mountainX: 0,
    cityX: 0,
    
    updatePhase: function() {
        if (score < 10) this.phase = 'day';
        else if (score < 20) this.phase = 'sunset';
        else this.phase = 'night';
    },

    draw: function() {
        // Parallax logic
        if (gameState !== 'GAMEOVER') {
            this.mountainX = (this.mountainX - gameSpeed * 0.2 * scale) % canvas.width;
            this.cityX = (this.cityX - gameSpeed * 0.5 * scale) % canvas.width;
        }
        
        this.updatePhase();

        // Gradient Sky
        let grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        if (this.phase === 'day') {
            grad.addColorStop(0, "#4facfe");
            grad.addColorStop(1, "#00f2fe");
        } else if (this.phase === 'sunset') {
            grad.addColorStop(0, "#fa709a");
            grad.addColorStop(1, "#fee140");
        } else { // night
            grad.addColorStop(0, "#0f2027");
            grad.addColorStop(1, "#203a43");
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        this.drawCelestialBody();

        // Stars (Night only)
        if (this.phase === 'night') {
            ctx.save();
            ctx.fillStyle = "#FFF";
            for(let i=0; i<30; i++) {
                // Twinkle effect
                let alpha = 0.5 + Math.sin(frames * 0.05 + i) * 0.5;
                ctx.globalAlpha = alpha;
                let sx = ((frames * 0.1) + (i * 123)) % canvas.width;
                let sy = (i * 97) % (canvas.height/1.5);
                ctx.beginPath();
                ctx.arc(sx, sy, Math.random() * 2, 0, Math.PI*2);
                ctx.fill();
            }
            ctx.restore();
        }

        // --- Layer 1: Mountains (Slowest) ---
        ctx.fillStyle = (this.phase === 'night') ? "#1a252f" : "#a8e6cf"; 
        if (this.phase === 'sunset') ctx.fillStyle = "#d35400"; 

        // Draw two copies for seamless loop
        for (let j = 0; j < 2; j++) {
            let offsetX = this.mountainX + (j * canvas.width);
            ctx.beginPath();
            ctx.moveTo(offsetX, canvas.height - 100 * scale);
            // Draw jagged mountains
            for (let i = 0; i <= 10; i++) {
                let mx = offsetX + (canvas.width / 10) * i;
                let my = canvas.height - 100 * scale - (i % 2 === 0 ? 150 * scale : 50 * scale);
                ctx.lineTo(mx, my);
            }
            ctx.lineTo(offsetX + canvas.width, canvas.height);
            ctx.lineTo(offsetX, canvas.height);
            ctx.fill();
            
            // Draw snow caps (simple triangles on peaks)
            if (this.phase !== 'sunset') { // Snow might look weird in sunset silhouette
                ctx.fillStyle = "rgba(255,255,255,0.8)";
                for (let i = 0; i <= 10; i+=2) { // Peaks are even indices
                        let mx = offsetX + (canvas.width / 10) * i;
                        let my = canvas.height - 100 * scale - 150 * scale;
                        ctx.beginPath();
                        ctx.moveTo(mx, my);
                        ctx.lineTo(mx - 15*scale, my + 30*scale);
                        ctx.lineTo(mx + 15*scale, my + 30*scale);
                        ctx.fill();
                }
                // Reset fill for next loop/fill
                ctx.fillStyle = (this.phase === 'night') ? "#1a252f" : "#a8e6cf"; 
            }
        }

        // --- Layer 2: City Silhouette (Removed) ---
        // The code for the green city buildings has been removed here.

        // --- Layer 3: Clouds (Floating) ---
        if (this.phase !== 'night') {
            ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
            for(let i=0; i<5; i++) {
                let cx = ((frames * 0.5) + (i * 200)) % (canvas.width + 200) - 100;
                let cy = canvas.height - 250 * scale - (i % 2) * 50;
                ctx.beginPath();
                ctx.arc(cx, cy, 40 * scale, 0, Math.PI * 2);
                ctx.arc(cx + 30 * scale, cy - 10 * scale, 50 * scale, 0, Math.PI * 2);
                ctx.arc(cx + 70 * scale, cy, 40 * scale, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    },

    drawCelestialBody: function() {
        ctx.save();
        if (this.phase === 'day') {
            // Sun High
            ctx.fillStyle = "#FDB813";
            ctx.shadowBlur = 20;
            ctx.shadowColor = "yellow";
            ctx.beginPath();
            ctx.arc(canvas.width - 100 * scale, 100 * scale, 40 * scale, 0, Math.PI*2);
            ctx.fill();
        } else if (this.phase === 'sunset') {
            // Sun Setting Low
            ctx.fillStyle = "#ff7e5f";
            ctx.shadowBlur = 20;
            ctx.shadowColor = "orange";
            ctx.beginPath();
            ctx.arc(canvas.width - 100 * scale, canvas.height - 250 * scale, 40 * scale, 0, Math.PI*2);
            ctx.fill();
        } else {
            // Moon
            ctx.fillStyle = "#F4F6F0";
            ctx.shadowBlur = 15;
            ctx.shadowColor = "white";
            ctx.beginPath();
            ctx.arc(canvas.width - 100 * scale, 80 * scale, 30 * scale, 0, Math.PI*2);
            ctx.fill();
            // Crater
            ctx.fillStyle = "#E6E6E6";
            ctx.beginPath();
            ctx.arc(canvas.width - 90 * scale, 90 * scale, 5 * scale, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.restore();
    }
};

const fg = {
    h: 0,
    x: 0,
    draw: function() {
        this.h = 100 * scale; 
        if (gameState !== 'GAMEOVER') {
            this.x = (this.x - gameSpeed * scale) % (20 * scale);
        }
        
        // Ground Color adaptation
        ctx.fillStyle = (bg.phase === 'night') ? '#7f8c8d' : '#ded895'; 
        ctx.fillRect(0, canvas.height - this.h, canvas.width, this.h);
        
        // Grass top
        ctx.fillStyle = (bg.phase === 'night') ? '#27ae60' : '#73bf2e';
        ctx.fillRect(0, canvas.height - this.h, canvas.width, 12 * scale);
        
        // Grass line
        ctx.strokeStyle = (bg.phase === 'night') ? '#2ecc71' : '#65a02c';
        ctx.beginPath();
        ctx.moveTo(0, canvas.height - this.h + 12 * scale);
        ctx.lineTo(canvas.width, canvas.height - this.h + 12 * scale);
        ctx.stroke();

        // Pattern
        ctx.fillStyle = (bg.phase === 'night') ? '#95a5a6' : '#cbb968';
        for(let i = this.x; i < canvas.width; i += 20 * scale) {
            ctx.beginPath();
            ctx.moveTo(i, canvas.height - this.h + 12 * scale);
            ctx.lineTo(i - 10 * scale, canvas.height);
            ctx.lineTo(i - 8 * scale, canvas.height);
            ctx.lineTo(i + 2 * scale, canvas.height - this.h + 12 * scale);
            ctx.fill();
        }
    }
};

const pipes = {
    items: [],
    w: 52,
    gap: 120, 
    dx: 3,

    draw: function() {
        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            let pipeWidth = this.w * scale;
            let topY = p.y;
            let bottomY = p.y + p.gap;

            // Pipe colors adapt to night time slightly
            ctx.fillStyle = (bg.phase === 'night') ? '#27ae60' : '#73bf2e';
            ctx.strokeStyle = (bg.phase === 'night') ? '#145a32' : '#558c22';
            ctx.lineWidth = 2;

            // Top Pipe
            ctx.fillRect(p.x, 0, pipeWidth, topY);
            ctx.strokeRect(p.x, 0, pipeWidth, topY);
            ctx.fillRect(p.x - 2 * scale, topY - 20 * scale, pipeWidth + 4 * scale, 20 * scale);
            ctx.strokeRect(p.x - 2 * scale, topY - 20 * scale, pipeWidth + 4 * scale, 20 * scale);

            // Bottom Pipe
            ctx.fillRect(p.x, bottomY, pipeWidth, canvas.height - bottomY - fg.h);
            ctx.strokeRect(p.x, bottomY, pipeWidth, canvas.height - bottomY - fg.h);
            ctx.fillRect(p.x - 2 * scale, bottomY, pipeWidth + 4 * scale, 20 * scale);
            ctx.strokeRect(p.x - 2 * scale, bottomY, pipeWidth + 4 * scale, 20 * scale);
        }
    },

    update: function() {
        const spacing = 200 * scale; 
        
        if (this.items.length === 0 || canvas.width - this.items[this.items.length - 1].x >= spacing) {
                const minPipe = 50 * scale;
                const maxPos = canvas.height - fg.h - (this.gap * scale) - minPipe;
                let posY = Math.floor(Math.random() * (maxPos - minPipe + 1)) + minPipe;

                let spawnX = canvas.width;
                if (this.items.length === 0) spawnX += 1000 * scale; 

                this.items.push({
                    x: spawnX,
                    y: posY,
                    initialY: posY, // Remember initial Y for movement
                    gap: this.gap * scale,
                    passed: false,
                    moving: (score > 10) // Enable movement if score is high
                });
        }

        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            p.x -= gameSpeed * scale;
            
            // Moving Pipes Logic (Vertical Sin Wave)
            if (p.moving) {
                p.y = p.initialY + Math.sin(frames * 0.05) * (30 * scale);
            }

            let pipeWidth = this.w * scale;
            
            if (bird.x + bird.radius * scale > p.x && bird.x - bird.radius * scale < p.x + pipeWidth) {
                if (bird.y - bird.radius * scale < p.y || bird.y + bird.radius * scale > p.y + p.gap) {
                    gameOver();
                }
            }

            if (p.x + pipeWidth < bird.x && !p.passed) {
                score++;
                scoreEl.innerText = score;
                p.passed = true;
                playSound('score');
                bg.updatePhase(); 

                // Increase speed gradually
                gameSpeed += 0.05;

                // Milestone Popup
                if (score % 10 === 0) {
                    playSound('milestone');
                    const messages = ["NICE!", "GREAT!", "AWESOME!", "UNSTOPPABLE!"];
                    const msg = messages[Math.min(Math.floor(score/10)-1, messages.length-1)] || "WOW!";
                    floatingTexts.push(new FloatingText(msg, canvas.width/2, canvas.height/3));
                }
            }

            if (p.x + pipeWidth < 0) {
                this.items.shift();
                i--;
            }
        }
    },
    
    reset: function() {
        this.items = [];
    }
};

// --- Game Logic ---

function init() {
    bird.reset();
    pipes.reset();
    particles = []; 
    floatingTexts = [];
    score = 0;
    frames = 0;
    gameSpeed = 3;
    scoreEl.innerText = score;
    gameState = 'START';
    autoPilot = false;
    
    // Reset background
    bg.phase = 'day';
    bg.mountainX = 0;
    bg.cityX = 0;
    
    startScreen.classList.remove('hidden');
    gameOverScreen.classList.add('hidden');
    scoreEl.style.display = 'none';
}

function startGame() {
    // Resume Audio Context if needed
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    gameState = 'PLAYING';
    autoPilot = true; 
    startScreen.classList.add('hidden');
    scoreEl.style.display = 'block';
    
    bird.x = canvas.width / 4; 
    bird.y = canvas.height / 2;
    bird.velocity = 0; 
}

function loop() {
    requestAnimationFrame(loop);
    frames++;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    bg.draw();

    // Draw pipes behind fg
    if (gameState === 'PLAYING') {
        pipes.update();
        pipes.draw();
    } else if (gameState === 'GAMEOVER') {
        pipes.draw();
    }

    fg.draw();

        // Draw and update particles
        for(let i=0; i<particles.length; i++) {
        particles[i].update();
        particles[i].draw();
        if (particles[i].life <= 0) {
            particles.splice(i, 1);
            i--;
        }
    }
    
    // Draw floating text (Milestones)
    for(let i=0; i<floatingTexts.length; i++) {
        floatingTexts[i].update();
        floatingTexts[i].draw();
        if (floatingTexts[i].alpha <= 0) {
            floatingTexts.splice(i, 1);
            i--;
        }
    }

    if (gameState === 'START') {
        bird.hover(); 
        bird.draw();
    } else if (gameState === 'PLAYING') {
        bird.update();
        bird.draw();
    } else if (gameState === 'GAMEOVER') {
        bird.draw();
    }
}

function gameOver() {
    if (gameState === 'GAMEOVER') return;
    gameState = 'GAMEOVER';
    
    playSound('crash');
    createParticles(bird.x, bird.y, 'explosion', 20);

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('flappyHighScore', highScore);
    }

    finalScoreEl.innerText = score;
    bestScoreEl.innerText = highScore;
    
    scoreEl.style.display = 'none';
    gameOverScreen.classList.remove('hidden');
}

// --- Input Handling ---

function flap(e) {
    if (e.type !== 'keydown') {
        // e.preventDefault(); 
    }
    if (e.target.tagName === 'BUTTON') return;

    if (gameState === 'START') {
        startGame();
    } else if (gameState === 'PLAYING') {
        if (autoPilot) autoPilot = false;
        bird.jump();
    }
}

window.addEventListener('keydown', function(e) {
    if (gameState === 'GAMEOVER' && e.code === 'Space') {
        init();
        return;
    }

    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        flap(e);
    }
});

window.addEventListener('mousedown', flap);
window.addEventListener('touchstart', (e) => {
    if(e.target.tagName !== 'BUTTON') {
        flap(e);
    }
}, {passive: false});

startBtn.addEventListener('click', startGame);
startBtn.addEventListener('touchstart', (e) => { e.stopPropagation(); startGame(); }); 

restartBtn.addEventListener('click', init);
restartBtn.addEventListener('touchstart', (e) => { e.stopPropagation(); init(); });

init();
loop();