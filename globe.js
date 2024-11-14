let scene, camera, renderer, globe, lines = [], tooltip;
const stateObjects = new Map();
const MIN_DOT_SIZE = 0.008;
const MAX_DOT_SIZE = 0.04;
let maxPopulation = 0;
let controls;
let isUserInteracting = false;

function getRadiusFromPopulation(population) {
    return MIN_DOT_SIZE + (MAX_DOT_SIZE - MIN_DOT_SIZE) * (population / maxPopulation);
}

function init() {
    // Setup scene with brighter background
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000d1a); // Dark blue background
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: true 
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Enhanced lighting for ScrollHub style
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(-10, 5, 10);
    scene.add(directionalLight);

    // Add point lights for better illumination
    const pointLight1 = new THREE.PointLight(0xffffff, 1);
    pointLight1.position.set(10, 10, 10);
    scene.add(pointLight1);

    // Create globe with Earth texture
    const textureLoader = new THREE.TextureLoader();
    const sphereGeometry = new THREE.SphereGeometry(5, 64, 64);

    // Load ScrollHub style textures
    Promise.all([
        textureLoader.loadAsync('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'),
        textureLoader.loadAsync('https://unpkg.com/three-globe/example/img/earth-topology.png'),
        textureLoader.loadAsync('https://unpkg.com/three-globe/example/img/earth-water.png')
    ]).then(([earthMap, bumpMap, specMap]) => {
        const sphereMaterial = new THREE.MeshPhongMaterial({
            map: earthMap,
            bumpMap: bumpMap,
            bumpScale: 0.05,
            specularMap: specMap,
            specular: new THREE.Color(0x333333),
            shininess: 5,
            transparent: true,
            opacity: 0.9
        });
        
        globe.material = sphereMaterial;

        // Add atmosphere glow
        const atmosphereGeometry = new THREE.SphereGeometry(5.2, 64, 64);
        const atmosphereMaterial = new THREE.ShaderMaterial({
            vertexShader: `
                varying vec3 vNormal;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vNormal;
                void main() {
                    float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
                    gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity;
                }
            `,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            transparent: true
        });

        const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
        scene.add(atmosphere);

        // Add clouds layer
        const cloudsGeometry = new THREE.SphereGeometry(5.03, 64, 64);
        textureLoader.load('https://unpkg.com/three-globe/example/img/earth-clouds.png', (cloudsTexture) => {
            const cloudsMaterial = new THREE.MeshPhongMaterial({
                map: cloudsTexture,
                transparent: true,
                opacity: 0.4
            });
            const clouds = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
            scene.add(clouds);

            // Animate clouds
            function animateClouds() {
                clouds.rotation.y += 0.0002;
                requestAnimationFrame(animateClouds);
            }
            animateClouds();
        });
    });

    // Initial material while textures load
    const initialMaterial = new THREE.MeshPhongMaterial({
        color: 0x93c5fd,  // Light blue color
        shininess: 25
    });
    
    globe = new THREE.Mesh(sphereGeometry, initialMaterial);
    scene.add(globe);

    // Update initial camera position to focus on US
    camera.position.set(-15, 5, -15);
    camera.lookAt(0, 0, 0);

    // Enhanced controls with auto-rotation
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.5;
    controls.minDistance = 7;
    controls.maxDistance = 25;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;

    // Handle user interaction
    controls.addEventListener('start', function() {
        isUserInteracting = true;
        controls.autoRotate = false;
    });

    controls.addEventListener('end', function() {
        setTimeout(() => {
            if (!isUserInteracting) {
                controls.autoRotate = true;
            }
        }, 2000); // Wait 2 seconds before resuming rotation
    });

    // Add mouse down/up listeners
    renderer.domElement.addEventListener('mousedown', () => {
        isUserInteracting = true;
        controls.autoRotate = false;
    });

    renderer.domElement.addEventListener('mouseup', () => {
        isUserInteracting = false;
        setTimeout(() => {
            if (!isUserInteracting) {
                controls.autoRotate = true;
            }
        }, 2000); // Wait 2 seconds before resuming rotation
    });

    // Add tooltip
    tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    document.body.appendChild(tooltip);

    // Load GeoJSON for US state borders
    fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json')
        .then(response => response.json())
        .then(geoData => {
            addStateBorders(geoData);
        });

    loadStates();
    renderer.domElement.addEventListener('click', onMouseClick, false);
    document.getElementById('resetButton').addEventListener('click', clearLines);
}

function addStateBorders(geoData) {
    const material = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        linewidth: 1
    });

    geoData.features.forEach(feature => {
        if (feature.geometry.type === "Polygon") {
            feature.geometry.coordinates.forEach(ring => {
                addRing(ring, material);
            });
        } else if (feature.geometry.type === "MultiPolygon") {
            feature.geometry.coordinates.forEach(polygon => {
                polygon.forEach(ring => {
                    addRing(ring, material);
                });
            });
        }
    });
}

function addRing(coordinates, material) {
    const points = [];
    coordinates.forEach(coord => {
        const lon = coord[0];
        const lat = coord[1];
        
        // Convert to radians
        const phi = (90 - lat) * Math.PI / 180;
        const theta = (lon + 180) * Math.PI / 180;
        
        // Calculate position on sphere
        const x = -(5.01 * Math.sin(phi) * Math.cos(theta));
        const y = 5.01 * Math.cos(phi);
        const z = 5.01 * Math.sin(phi) * Math.sin(theta);
        
        points.push(new THREE.Vector3(x, y, z));
    });

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 1;
    globe.add(line);
}

function loadStates() {
    maxPopulation = Math.max(...statesData.features.map(state => state.properties.population || 5000000));

    statesData.features.forEach(state => {
        const center = state.properties.center;
        // Corrected coordinate conversion for US states
        const lon = center[0];
        const lat = center[1];
        
        // Convert to radians
        const phi = (90 - lat) * Math.PI / 180;
        const theta = (lon + 180) * Math.PI / 180;
        
        // Calculate position on sphere
        const x = -(5 * Math.sin(phi) * Math.cos(theta));
        const y = 5 * Math.cos(phi);
        const z = 5 * Math.sin(phi) * Math.sin(theta);

        // Create state marker
        const radius = getRadiusFromPopulation(state.properties.population || 5000000);
        const markerGeometry = new THREE.SphereGeometry(radius, 16, 16);
        const markerMaterial = new THREE.MeshBasicMaterial({
            color: 0xff4400,
            transparent: true,
            opacity: 0.8
        });
        
        const stateMesh = new THREE.Mesh(markerGeometry, markerMaterial);
        stateMesh.position.set(x, y, z);
        stateMesh.userData.state = state.properties;
        
        // Add state name label
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        context.font = 'bold 12px Arial';
        context.fillStyle = '#ffffff';
        context.textAlign = 'center';
        context.fillText(state.properties.name, 128, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const labelMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0.8
        });

        const label = new THREE.Sprite(labelMaterial);
        label.position.set(x * 1.1, y * 1.1, z * 1.1);
        label.scale.set(1, 0.25, 1);
        
        globe.add(stateMesh);
        globe.add(label);
        stateObjects.set(state.properties.name, stateMesh);
    });

    // Position camera to focus on US
    camera.position.set(-15, 5, -15);  // Adjusted camera position
    camera.lookAt(0, 0, 0);
}

function drawConnectionsToState(selectedState) {
    stateObjects.forEach((stateMesh, stateName) => {
        if (stateMesh !== selectedState) {
            const distance = calculateDistance(
                selectedState.userData.state.center,
                stateMesh.userData.state.center
            );

            // Create curved lines
            const points = [];
            const start = selectedState.position;
            const end = stateMesh.position;
            const mid = start.clone().add(end).multiplyScalar(0.5);
            mid.normalize().multiplyScalar(6);

            for (let i = 0; i <= 50; i++) {
                const t = i / 50;
                points.push(new THREE.Vector3().lerpVectors(
                    new THREE.Vector3().lerpVectors(start, mid, t),
                    new THREE.Vector3().lerpVectors(mid, end, t),
                    t
                ));
            }

            const curve = new THREE.CatmullRomCurve3(points);
            const geometry = new THREE.TubeGeometry(curve, 50, 0.008, 8, false);
            
            const material = new THREE.MeshBasicMaterial({
                color: 0xff4400,
                transparent: true,
                opacity: 0.6
            });

            const tube = new THREE.Mesh(geometry, material);
            tube.userData = {
                fromState: selectedState.userData.state.name,
                toState: stateMesh.userData.state.name,
                distance: distance,
                defaultOpacity: 0.6
            };

            scene.add(tube);
            lines.push(tube);
        }
    });

    // Add tooltip showing selected state info
    tooltip.style.display = 'block';
    tooltip.style.left = event.clientX + 'px';
    tooltip.style.top = event.clientY + 'px';
    tooltip.innerHTML = `Selected: ${selectedState.userData.state.name}`;
}

function calculateDistance(coord1, coord2) {
    const R = 6371; // Earth's radius in km
    const lat1 = coord1[1] * Math.PI / 180;
    const lat2 = coord2[1] * Math.PI / 180;
    const dLat = (coord2[1] - coord1[1]) * Math.PI / 180;
    const dLon = (coord2[0] - coord1[0]) * Math.PI / 180;

    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c);
}

function clearLines() {
    lines.forEach(line => scene.remove(line));
    lines = [];
    isUserInteracting = false;
    setTimeout(() => {
        if (!isUserInteracting) {
            controls.autoRotate = true;
        }
    }, 2000);
}

function onMouseClick(event) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    
    const stateMarkers = globe.children.filter(child => 
        child.geometry && child.geometry.type === 'SphereGeometry' && 
        child.material && child.material.color.getHex() === 0xff4400
    );
    
    const intersects = raycaster.intersectObjects(stateMarkers);

    if (intersects.length > 0) {
        const selectedState = intersects[0].object;
        clearLines();
        drawConnectionsToState(selectedState);
        controls.autoRotate = false;
        isUserInteracting = true;
    }
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    controls.update();  // Required for damping and auto-rotation
}

function onMouseMove(event) {
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    raycaster.params.Line.threshold = 0.1; // Make line detection more generous

    // First check state markers
    const stateMarkers = globe.children.filter(child => 
        child.geometry && child.geometry.type === 'SphereGeometry' && 
        child.material && child.material.color.getHex() === 0xff4400
    );
    
    let intersects = raycaster.intersectObjects(stateMarkers);
    
    // Then check connection lines
    const lineIntersects = raycaster.intersectObjects(lines);
    intersects = intersects.concat(lineIntersects);

    // Reset all hover states
    [...stateMarkers, ...lines].forEach(obj => {
        if (obj.material) {
            if (obj.userData.isHovered) {
                obj.material.opacity = obj.userData.defaultOpacity || 0.6;
            }
        }
    });
    tooltip.style.display = 'none';

    if (intersects.length > 0) {
        const object = intersects[0].object;
        
        if (object.userData.state) {
            // Hovering over state marker
            object.material.opacity = 1;
            tooltip.style.display = 'block';
            tooltip.style.left = event.clientX + 'px';
            tooltip.style.top = event.clientY + 'px';
            tooltip.innerHTML = `
                State: ${object.userData.state.name}<br>
                Population: ${(object.userData.state.population || 0).toLocaleString()}
            `;
        } else if (object.userData.fromState) {
            // Hovering over connection line
            object.material.opacity = 1;
            tooltip.style.display = 'block';
            tooltip.style.left = event.clientX + 'px';
            tooltip.style.top = event.clientY + 'px';
            tooltip.innerHTML = `
                From: ${object.userData.fromState}<br>
                To: ${object.userData.toState}<br>
                Distance: ${object.userData.distance} km
            `;
        }
    }
}

document.addEventListener('mousemove', onMouseMove);

init();
animate();