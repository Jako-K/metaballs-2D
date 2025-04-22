"use strict";



////////////////////////////////////////////////////////////////////////////////
// Helpers
////////////////////////////////////////////////////////////////////////////////

function createShader(gl, type, source) {
    // Compile vertex and fragment shader
    // SOURCE: https://webglfundamentals.org/webgl/lessons/webgl-fundamentals.html
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) {
        return shader;
    }

    console.log(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
}

function createProgram(gl, vertexShader, fragmentShader) {
    // Create GLSL program on the GPU
    // SOURCE: https://webglfundamentals.org/webgl/lessons/webgl-fundamentals.html
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    var success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (success) {return program;}
    console.log(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
}

function resizeCanvasToDisplaySize(canvas) {
    // SOURCE: https://webglfundamentals.org/webgl/lessons/webgl-resizing-the-canvas.html

    // Lookup the size the browser is displaying the canvas in CSS pixels.
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;

    // Check if the canvas is not the same size.
    const needResize = canvas.width !== displayWidth ||
        canvas.height !== displayHeight;

    if (needResize) {
        // Make the canvas the same size
        canvas.width = displayWidth;
        canvas.height = displayHeight;
    }
    return needResize;
}


function init_gl(vertexShaderSource, fragmentShaderSource, canvas_name){
    // Init gl
    let canvas = document.getElementById("c");
    let gl = canvas.getContext("webgl")
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl = WebGLUtils.setupWebGL(canvas);
    if (!gl) {
        alert("WebGL isn’t available");
    }

    // Combine everything into a GLSL program on the GPU
    let vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    let fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    gl.program = createProgram(gl, vertexShader, fragmentShader);

    // Ensure the canvas is drawn correctly and to scale
    resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Tell it to use our program (pair of shaders)
    gl.useProgram(gl.program);

    return gl
}


function updateGrid(vertices, grid_size, gl) {
    vertices = [];
    let CELL_SIZE = 1024/grid_size;
    let CELL_SIZE_HALF = CELL_SIZE/2;
    let CELL_SIZE_DOUBLE = CELL_SIZE*2;
    gl.uniform1f(gl.getUniformLocation(gl.program, 'CELL_SIZE'), CELL_SIZE);
    gl.uniform1f(gl.getUniformLocation(gl.program, 'CELL_SIZE_HALF'), CELL_SIZE_HALF);

    for (let y = 0; y < grid_size; y++) {
        for (let x = 0; x < grid_size; x++) {
            const x0 = (x * CELL_SIZE_DOUBLE)/1024 - 1.0;
            const y0 = (y * CELL_SIZE_DOUBLE)/1024 - 1.0;
            const x1 = x0 + CELL_SIZE_DOUBLE/1024;
            const y1 = y0 + CELL_SIZE_DOUBLE/1024;

            vertices.push(
                x0, y0,
                x1, y0,
                x0, y1,
                x0, y1,
                x1, y0,
                x1, y1,
            );
        }
    }

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.vertexAttribPointer(gl.getAttribLocation(gl.program, 'a_position'), 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.getAttribLocation(gl.program, 'a_position'));
    return vertices;
}

function update_circle_position(c_xs, c_ys, c_rs, c_speed_xs, c_speed_ys, WIDTH=1024, HEIGHT=1024){
    for (let i = 0; i < c_speed_xs.length; i++) {
        if (followMouseBool && (i===0)) {
            continue
        }

        let x = c_xs[i] + c_speed_xs[i];
        let y = c_ys[i] + c_speed_ys[i];
        let r = c_rs[i]
        c_xs[i] = x;
        c_ys[i] = y;

        // Check collision with walls
        if ( (x - r <= 10) || (x + r >= WIDTH - 10) )
            c_speed_xs[i] = -1 * c_speed_xs[i]
        if ( (y - r <= 10) || (y + r >= HEIGHT - 10) )
            c_speed_ys[i] = -1 * c_speed_ys[i]
    }
}


////////////////////////////////////////////////////////////////////////////////
// Vertex and fragment shader
////////////////////////////////////////////////////////////////////////////////


const vertexShaderSource = `

uniform float circleViewToggleBool;
uniform float r_slider;
uniform float g_slider;
uniform float b_slider;
uniform float glow_slider;

uniform float CELL_SIZE;
uniform float CELL_SIZE_HALF;

// These 3 are used as normal arrays passed from the CPU to the GPU,
// Where index 0 holds value for the first circle, index 1 for next and index 2 for the final one. 
// This could have been done more elegantly with a 2d texture map which would also allow for an arbitrary 
// number of circles, but it seemed a bit overkill for this simple application, hence this solution.
uniform vec3 v_circle_xs;
uniform vec3 v_circle_ys;
uniform vec3 v_circle_rs;

attribute vec2 a_position;
varying vec4 f_color;

void main() {
    float v, c_r, c_x, c_y, x_diff, y_diff, denominator, numerator;
    float x_cartesian = (a_position.x + 1.) * 1024. / 2.;
    float y_cartesian = (a_position.y + 1.) * 1024. / 2.;
    
    // Compute equation (4) for each vertex
    float epsilon = 0.01;
    for (int i = 0; i < 3; i++) {
        c_r = v_circle_rs[i];
        c_x = v_circle_xs[i];
        c_y = v_circle_ys[i];
        x_diff = (c_x - x_cartesian);
        y_diff = (c_y - y_cartesian);
        denominator = x_diff*x_diff + y_diff*y_diff; 
        numerator = c_r*c_r; 
        
        // details about the circleViewToggleBool can be found in the "User Input" section.
        if ((circleViewToggleBool == 1.0) && (denominator <= numerator)){
            v = 0.0;
            break;
        }  
        
        v += numerator / (denominator + epsilon);
    }
    
    gl_Position = vec4(a_position[0], a_position[1], 0.0, 1.0);
    
    // details about the glow_slider can be found in the "User Input" section.
    if(v < 1.0)
        v = pow(v, glow_slider);
        
    // details about the [rgb]_slider can be found in the "User Input" section.
    f_color = vec4(v*r_slider, v*g_slider, v*b_slider, 1.0);
}`;

const fragmentShaderSource = `
precision mediump float;
uniform vec4 u_color;
varying vec4 f_color;
void main() {
    gl_FragColor = f_color;
}`;


////////////////////////////////////////////////////////////////////////////////
// Initialization
////////////////////////////////////////////////////////////////////////////////

// Initialize webgl with shaders and all
let gl = init_gl(vertexShaderSource, fragmentShaderSource, "c")

// Geometry
let vertices = [];
let c_xs = [150, 300, 900];
let c_ys = [900, 256, 150];
let c_rs = [100, 150, 50];
let c_speed_xs = [-3, 2, -0.5];
let c_speed_ys = [4, -2, 0.5]

// user adjustable variables
let r_slider;
let g_slider;
let b_slider;
let glow_slider;
let movement_is_on;
let circleViewToggleBool;
let followMouseBool;
let grid_size;


////////////////////////////////////////////////////////////////////////////////
// UI
////////////////////////////////////////////////////////////////////////////////

// Sliders
const redSlider = document.getElementById('redSlider');
r_slider = 1 + redSlider.value / 255.0;
redSlider.addEventListener('input', function() {r_slider = 1 + this.value/255.0;});

const greenSlider = document.getElementById('greenSlider');
g_slider = 1 + greenSlider.value / 255.0;
greenSlider.addEventListener('input', function() {g_slider = 1 + this.value/255.0;});

const blueSlider = document.getElementById('blueSlider');
b_slider = 1 + blueSlider.value / 255.0;
blueSlider.addEventListener('input', function() {b_slider = 1 + this.value/255.0;});

const glowSlider = document.getElementById('glowSlider');
glow_slider = glowSlider.max - glowSlider.value;
glowSlider.addEventListener('input', function() {
    glow_slider = Math.max(glowSlider.max - this.value, glowSlider.min);
    console.log(glow_slider)
});

const gridSizeSlider = document.getElementById('gridSizeSlider');
grid_size = gridSizeSlider.value;
const gridSizeValue = document.getElementById('gridSizeValue')
gridSizeSlider.addEventListener("change", function (){
    grid_size=this.value;
    gridSizeValue.textContent = grid_size;
    vertices = updateGrid(vertices, grid_size, gl);
})
gridSizeSlider.addEventListener("change", updateGrid);


// Toggles
const movementToggle = document.getElementById('movementToggle');
movement_is_on = movementToggle.checked;
movementToggle.addEventListener('change', function() {movement_is_on = this.checked;});

circleViewToggleBool = 1.0;
const circleViewToggle = document.getElementById('circleViewToggle');
circleViewToggle.addEventListener('change', function() {
    circleViewToggleBool = this.checked ? 1.0 : 0.0;
    gl.uniform1f(gl.getUniformLocation(gl.program, 'circleViewToggleBool'), circleViewToggleBool);
})

const followMouseToggle = document.getElementById('followMouseToggle');
followMouseBool = followMouseToggle.checked;
followMouseToggle.addEventListener('change', function() {followMouseBool = followMouseToggle.checked;});

// Mouse
gl.canvas.addEventListener("mousemove", function (event) {
    if (followMouseBool) {
        const rect = gl.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = gl.canvas.height - (event.clientY - rect.top);
        c_xs[0] = Math.min(Math.max(150, x), 1024 - 150);
        c_ys[0] = Math.min(Math.max(150, y), 1024 - 150);
    }
});


////////////////////////////////////////////////////////////////////////////////
// Render
////////////////////////////////////////////////////////////////////////////////


function draw(){
    // Handle movement of balls
    if (movement_is_on){
        update_circle_position(c_xs, c_ys, c_rs, c_speed_xs, c_speed_ys);
    }

    // Set uniforms
    gl.uniform3fv(gl.getUniformLocation(gl.program, 'v_circle_xs'), c_xs);
    gl.uniform3fv(gl.getUniformLocation(gl.program, 'v_circle_ys'), c_ys);
    gl.uniform3fv(gl.getUniformLocation(gl.program, 'v_circle_rs'), c_rs);
    gl.uniform1f(gl.getUniformLocation(gl.program, 'r_slider'), r_slider);
    gl.uniform1f(gl.getUniformLocation(gl.program, 'g_slider'), g_slider);
    gl.uniform1f(gl.getUniformLocation(gl.program, 'b_slider'), b_slider);
    gl.uniform1f(gl.getUniformLocation(gl.program, 'glow_slider'), glow_slider);


    // Draw
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, grid_size*grid_size*6)
    setTimeout(draw, 10)
}

// Start program
vertices = updateGrid(vertices, grid_size, gl)
draw()
















