// --- LOGICA 3D ---
        let scene, camera, renderer, workflowGroup, particleSystem, agentFlash;
        let mouseX = 0, mouseY = 0;
        const pulses = [];
        const introNodes = [];
        const introCables = [];

        // Materiales ajustados para estilo "Business/Google" (Más limpios, menos brillantes)
        const mercuryMat = new THREE.MeshPhysicalMaterial({
            color: 0xeeeeee,         // Casi blanco
            metalness: 0.6,          // Menos metálico, más plástico premium
            roughness: 0.2,          // Mate satinado
            envMapIntensity: 1.0,
            clearcoat: 0.5
        });

        const cableMat = new THREE.MeshStandardMaterial({ 
            color: 0x999999,
            roughness: 0.8,     
            metalness: 0.1
        });

        // Etiqueta limpia
        function createLabel() {
            const canvas = document.createElement('canvas');
            canvas.width = 1024; canvas.height = 512;
            const ctx = canvas.getContext('2d');
            // Fondo transparente, texto negro nítido
            ctx.fillStyle = '#000000'; 
            ctx.font = 'bold 90px "Inter", sans-serif'; // Fuente Inter
            ctx.textAlign = 'center';
            ctx.fillText('AGENTE IA', 512, 280);
            const tex = new THREE.CanvasTexture(canvas);
            tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
            return new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.7 });
        }

        function createNode(x, z, w, d, isAgent = false, isRound = false) {
            const group = new THREE.Group();
            const h = isAgent ? 3.5 : 2; // Nodos más bajos (minimalistas)
            
            // Geometría un poco más afilada (menos subdivisiones en bevel si fuera boxgeometry, aqui es standard)
            let geo = isRound ? new THREE.CylinderGeometry(w/2, w/2, h, 64) : new THREE.BoxGeometry(w, h, d);
            
            const mesh = new THREE.Mesh(geo, mercuryMat);
            mesh.position.y = h/2;
            mesh.castShadow = true; 
            mesh.receiveShadow = true;
            group.add(mesh);

            if(isAgent) {
                const label = new THREE.Mesh(new THREE.PlaneGeometry(w*0.8, d*0.4), createLabel());
                label.rotation.x = -Math.PI / 2; label.position.y = h + 0.1;
                group.add(label);
                
                // Luz de agente blanca/azul muy sutil
                agentFlash = new THREE.PointLight(0x3b82f6, 0, 40, 2);
                agentFlash.position.y = h/2;
                group.add(agentFlash);
            }
            group.position.set(x, 0, z);
            group.scale.set(0, 0, 0);
            introNodes.push(group);
            workflowGroup.add(group);
            return group;
        }

        function connectSmart(startNode, endNode, type) {
            const s = startNode.position.clone(); s.y = 0.3;
            const e = endNode.position.clone(); e.y = 0.3;
            const points = [s];
            if (type === 'bottom_tool') {
                const avoidanceZ = e.z + 8;
                points.push(new THREE.Vector3(s.x, 0.3, avoidanceZ));
                points.push(new THREE.Vector3(s.x * 0.3, 0.3, avoidanceZ));
                points.push(new THREE.Vector3(s.x * 0.3, 0.3, e.z));
            } else if (type === 'side_trigger') points.push(new THREE.Vector3(s.x, 0.3, e.z));
            else if (type === 'side_output') points.push(new THREE.Vector3(e.x, 0.3, s.z));
            points.push(e);

            // Curvas un poco más rectas (tension 0.1)
            const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.05);
            const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.25, 8, false), cableMat); // Cables más finos
            tube.scale.set(0, 0, 0);
            introCables.push(tube);
            tube.receiveShadow = true; 
            workflowGroup.add(tube);

            // Pulso pequeño
            const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.35), new THREE.MeshBasicMaterial({color: 0x333333})); // Pulso oscuro
            pulse.userData = { curve, progress: Math.random(), isIncoming: type !== 'side_output' };
            pulse.visible = false;
            pulses.push(pulse);
            workflowGroup.add(pulse);
        }

        function init3D() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0xffffff);
            
            // NIEBLA LINEAL THREE.JS (Profundidad)
            // Empieza a 80 y termina a 220. Esto desvanece el horizonte.
            scene.fog = new THREE.Fog(0xffffff, 80, 220); 

            camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 1, 1000);
            
            renderer = new THREE.WebGLRenderer({ 
                canvas: document.getElementById('hero-canvas'), 
                antialias: true, 
                alpha: true,
                powerPreference: "high-performance", // PERFORMANCE: Pide GPU dedicada si hay
                precision: window.innerWidth < 768 ? "mediump" : "highp" // PERFORMANCE: Menos carga en moviles
            });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
            
            // PERFORMANCE OPTIMIZATION: Las sombras son costosas. Como los objetos (edificios/nodos) 
            // no se mueven de posición (solo la cámara se mueve), no necesitamos recalcular sombras en cada frame.
            // Las calcularemos una vez y ya.
            renderer.shadowMap.autoUpdate = false; 

            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.3;

            // Iluminación HDRI simulada (Cajas blancas para reflejos)
            const pmremGenerator = new THREE.PMREMGenerator(renderer);
            pmremGenerator.compileEquirectangularShader();
            const envScene = new THREE.Scene();
            envScene.background = new THREE.Color(0xffffff);
            const box = new THREE.Mesh(new THREE.BoxGeometry(50,50,50), new THREE.MeshBasicMaterial({color:0xffffff}));
            envScene.add(box);
            scene.environment = pmremGenerator.fromScene(envScene).texture;

            workflowGroup = new THREE.Group();
            // POSICIÓN CLAVE: Bajamos el grupo para que no toque el texto superior
            workflowGroup.position.y = -6; 
            workflowGroup.position.z = 20; // Lo acercamos un poco
            scene.add(workflowGroup);

            // Crear Nodos
            const agent = createNode(0, 0, 28, 16, true);
            const trigger = createNode(-50, 0, 12, 10);
            const tool1 = createNode(-22, 40, 10, 10, false, true);
            const tool2 = createNode(-8, 40, 10, 10, false, true);
            const tool3 = createNode(8, 40, 10, 10, false, true);
            const tool4 = createNode(22, 40, 10, 10, false, true);
            const out1 = createNode(50, -15, 12, 10);
            const out2 = createNode(50, 15, 12, 10);

            connectSmart(trigger, agent, 'side_trigger');
            connectSmart(tool1, agent, 'bottom_tool');
            connectSmart(tool2, agent, 'bottom_tool');
            connectSmart(tool3, agent, 'bottom_tool');
            connectSmart(tool4, agent, 'bottom_tool');
            connectSmart(agent, out1, 'side_output');
            connectSmart(agent, out2, 'side_output');

            // Grid minimalista (Gris muy claro)
            const grid = new THREE.GridHelper(600, 150, 0xdddddd, 0xf0f0f0); 
            grid.position.y = 0;
            grid.material.transparent = true;
            grid.material.opacity = 0.6;
            workflowGroup.add(grid);

            // Suelo Sólido
            const floor = new THREE.Mesh(
                new THREE.PlaneGeometry(2000, 2000), 
                new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 1, metalness: 0})
            );
            floor.rotation.x = -Math.PI / 2; floor.position.y = -0.1; floor.receiveShadow = true;
            workflowGroup.add(floor);

            // PARTÍCULAS (Discretas)
            const pCount = 2000;
            const pPos = new Float32Array(pCount * 3);
            for(let i=0; i<pCount*3; i+=3) {
                pPos[i] = (Math.random() - 0.5) * 200;
                pPos[i+1] = Math.random() * 50; 
                pPos[i+2] = (Math.random() - 0.5) * 150;
            }
            const pGeo = new THREE.BufferGeometry();
            pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
            const pMat = new THREE.PointsMaterial({
                size: 0.25,
                color: 0xbbbbbb, // Gris suave
                transparent: true,
                opacity: 0.5
            });
            particleSystem = new THREE.Points(pGeo, pMat);
            scene.add(particleSystem);

            // LUCES (Estudio fotográfico limpio)
            const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
            mainLight.position.set(-50, 80, 50);
            mainLight.castShadow = true;
            mainLight.shadow.mapSize.set(2048, 2048);
            mainLight.shadow.bias = -0.0001;
            scene.add(mainLight);

            const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
            fillLight.position.set(50, 50, -50);
            scene.add(fillLight);
            
            scene.add(new THREE.AmbientLight(0xffffff, 0.7));

            // Aseguramos que las sombras se calculen al menos una vez al inicio
            renderer.shadowMap.needsUpdate = true;

            // RESPONSIVE CAM
            if (window.innerWidth < 768) {
                // En movil, camara mas alta para ver el modelo abajo
                camera.position.set(120, 150, 120); 
                workflowGroup.scale.set(0.6, 0.6, 0.6);
            } else {
                // Desktop: Ángulo isomético limpio
                camera.position.set(100, 90, 100); 
            }

            // ANIMACIÓN DE ENTRADA
            const tl = gsap.timeline({delay: 0.2});
            
            // Camara se acerca suavemente
            tl.to(camera.position, { 
                x: window.innerWidth<768?100:80, 
                y: 70, 
                z: window.innerWidth<768?100:80, 
                duration: 3, 
                ease: "power2.out" 
            }, 0);
            
            tl.to(introNodes.map(n => n.scale), {x:1, y:1, z:1, duration: 0.8, stagger: 0.05, ease: "back.out(1.5)"}, 0.5);
            tl.to(introCables.map(c => c.scale), {x:1, y:1, z:1, duration: 1, stagger: 0.05, ease: "power2.out"}, 1.0);
            tl.call(() => { pulses.forEach(p => p.visible = true) }, null, 1.8);

            animate();
        }

        function animate() {
            requestAnimationFrame(animate);
            const time = Date.now() * 0.001;

            pulses.forEach(p => {
                if(!p.visible) return;
                p.userData.progress += 0.004;
                if(p.userData.progress > 1) p.userData.progress = 0;
                const pt = p.userData.curve.getPointAt(p.userData.progress);
                p.position.copy(pt); p.position.y += 0.5;
            });

            if(particleSystem) particleSystem.rotation.y = time * 0.03;

            // Parallax sutil con el mouse
            let tx = (window.innerWidth < 768 ? 100 : 80) + (mouseX * 5);
            let ty = 70 + (-mouseY * 5);
            camera.position.x += (tx - camera.position.x) * 0.05;
            camera.position.y += (ty - camera.position.y) * 0.05;
            
            // La cámara mira al centro del grupo de trabajo
            camera.lookAt(0, 0, 0);

            renderer.render(scene, camera);
        }

        // PERFORMANCE: Debounce/Throttle para el resize
        // Evita que el navegador colapse si el usuario redimensiona la ventana frenéticamente
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                camera.aspect = window.innerWidth / window.innerHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
                if(window.innerWidth < 768) workflowGroup.scale.set(0.6, 0.6, 0.6);
                else workflowGroup.scale.set(1, 1, 1);
                
                // Actualizar sombras si la ventana cambia drásticamente
                renderer.shadowMap.needsUpdate = true;
            }, 100);
        });

        window.addEventListener('mousemove', (e) => {
            mouseX = (e.clientX / window.innerWidth) - 0.5;
            mouseY = (e.clientY / window.innerHeight) - 0.5;
        });

        init3D();

        const lenis = new Lenis();
        function raf(time){lenis.raf(time); requestAnimationFrame(raf);}
        requestAnimationFrame(raf);

        document.addEventListener('DOMContentLoaded', () => {
            gsap.to('.reveal-text', {opacity: 1, y: 0, duration: 0.8, stagger: 0.1, ease: 'power2.out'});
        });

        // --- NUEVO CODIGO: Animaciones de Scroll con GSAP ---
        // Asegúrate de registrar el plugin primero
        gsap.registerPlugin(ScrollTrigger);

        // 1. Animación del Manifiesto (Texto que aparece)
        gsap.utils.toArray('.scroll-reveal').forEach(elem => {
            gsap.from(elem, {
                scrollTrigger: {
                    trigger: elem,
                    start: "top 80%", // Empieza cuando el elemento está al 80% de la ventana
                    toggleActions: "play none none reverse"
                },
                y: 50,
                opacity: 0,
                duration: 1,
                ease: "power3.out"
            });
        });

        // 2. Animación Bento Grid (Staggered - uno tras otro)
        gsap.to('.bento-card', {
            scrollTrigger: {
                trigger: '.bento-card',
                start: "top 85%"
            },
            y: 0,
            opacity: 1,
            duration: 0.8,
            stagger: 0.1, // Retraso entre cada carta
            ease: "back.out(1.2)"
        });

        // 3. Contadores de números (Count up)
        gsap.utils.toArray('.count-up').forEach(counter => {
            const target = counter.getAttribute('data-target');
            gsap.to(counter, {
                scrollTrigger: {
                    trigger: counter,
                    start: "top 85%",
                    once: true // Solo se anima una vez
                },
                innerText: target,
                duration: 2,
                snap: { innerText: 1 }, // Asegura números enteros
                ease: "power1.out",
                onUpdate: function() {
                    counter.innerHTML = Math.ceil(this.targets()[0].innerText);
                }
            });
        });

        // 4. CTA Final
        gsap.to('.cta-buttons', {
            scrollTrigger: {
                trigger: '.cta-text',
                start: "top 70%"
            },
            y: 0,
            opacity: 1,
            duration: 1,
            delay: 0.5,
            ease: "power2.out"
        });


        // --- LÓGICA DE CARRUSEL DE NICHOS ---

let currentNicheIndex = 0;
let nicheInterval;
const totalNiches = 4; // Tenemos 4 industrias
const autoPlayDuration = 5000; // 5 segundos por slide

function switchNiche(index) {
    // 1. Resetear el intervalo automático para que no salte de golpe si el usuario hace clic
    clearInterval(nicheInterval);
    
    // 2. Actualizar índice
    currentNicheIndex = index;
    
    // 3. Seleccionar elementos del DOM
    const tabs = document.querySelectorAll('.niche-tab');
    const images = document.querySelectorAll('.niche-image');
    
    // 4. Quitar clase activa de todos
    tabs.forEach(t => t.classList.remove('active'));
    images.forEach(img => img.classList.remove('active'));
    
    // 5. Activar el seleccionado
    if(tabs[index]) tabs[index].classList.add('active'); // Safety check
    if(images[index]) images[index].classList.add('active'); // Safety check
    
    // 6. Reiniciar el autoplay
    startNicheAutoplay();
}

function startNicheAutoplay() {
    nicheInterval = setInterval(() => {
        let nextIndex = (currentNicheIndex + 1) % totalNiches;
        switchNiche(nextIndex);
    }, autoPlayDuration);
}

// Iniciar al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    // Asegurarse de que el primero esté activo
    // switchNiche(0); // Comentado temporalmente si no usas tabs explicítas
    startNicheAutoplay();
});


// --- SLIDER CON FÍSICA DE INERCIA (MOMENTUM) ---
document.addEventListener('DOMContentLoaded', () => {
    const slider = document.getElementById('slider-track');
    let isDown = false;
    let startX;
    let scrollLeft;
    let velX = 0; // Velocidad actual
    let momentumID; // ID para cancelar la animación

    if (slider) {
        // 1. AL PRESIONAR (mousedown)
        slider.addEventListener('mousedown', (e) => {
            isDown = true;
            slider.classList.add('active'); // Cursor grabbing
            slider.style.scrollBehavior = 'auto'; // Desactivar suavizado CSS para control total JS
            
            // Detener cualquier inercia previa
            cancelAnimationFrame(momentumID);
            
            startX = e.pageX - slider.offsetLeft;
            scrollLeft = slider.scrollLeft;
        });

        // 2. AL SALIR O SOLTAR (mouseleave / mouseup)
        const stopDrag = () => {
            isDown = false;
            slider.classList.remove('active');
            beginMomentum(); // Iniciar inercia al soltar
        };

        slider.addEventListener('mouseleave', stopDrag);
        slider.addEventListener('mouseup', stopDrag);

        // 3. AL MOVER (mousemove)
        slider.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault(); // Evita selección de texto nativa
            
            const x = e.pageX - slider.offsetLeft;
            const walk = (x - startX) * 1.5; // Multiplicador de velocidad (1.5x)
            
            // Calcular velocidad instantánea (Diferencia entre posición anterior y actual)
            const prevScrollLeft = slider.scrollLeft;
            slider.scrollLeft = scrollLeft - walk;
            velX = slider.scrollLeft - prevScrollLeft; 
        });

        // 4. RUEDA DEL MOUSE (Horizontal)
        slider.addEventListener('wheel', (evt) => {
            if (slider.scrollWidth > slider.clientWidth) {
                // Solo si hay overflow horizontal
                if(Math.abs(evt.deltaX) > Math.abs(evt.deltaY)){
                    evt.preventDefault();
                    // Aquí sí usamos smooth porque es un evento discreto
                    slider.style.scrollBehavior = 'smooth'; 
                    slider.scrollLeft += evt.deltaX * 2;
                }
                
                // Resetear behavior después de un momento
                setTimeout(() => { slider.style.scrollBehavior = 'auto'; }, 500);
            }
        });

        // 5. FUNCIÓN DE INERCIA (Loop de animación)
        function beginMomentum() {
            // Cancelar si la velocidad es muy baja
            if (Math.abs(velX) < 0.5) return;

            momentumID = requestAnimationFrame(beginMomentum);

            slider.scrollLeft += velX;
            velX *= 0.95; // Fricción (0.95 = se detiene suavemente)
            
            // Limites del scroll
            if (slider.scrollLeft <= 0 || slider.scrollLeft >= slider.scrollWidth - slider.clientWidth) {
                velX = 0; // Detener si choca con los bordes
            }
        }
    }
});

//Nav
// === VARIABLES ===
    const nav = document.getElementById('main-nav');
    const menuBtn = document.getElementById('menu-toggle');
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileLinks = document.querySelectorAll('.mobile-link');
    const iconOpen = document.getElementById('icon-open');
    const iconClose = document.getElementById('icon-close');
    
    let isMenuOpen = false;
    let lastScrollY = window.scrollY; // Para rastrear la posición anterior

    // === LÓGICA DEL MENÚ HAMBURGUESA (Móvil) ===
    function toggleMenu() {
        isMenuOpen = !isMenuOpen;
        
        if (isMenuOpen) {
            // Abrir menú
            mobileMenu.classList.remove('-translate-x-full');
            mobileMenu.classList.add('translate-x-0');
            
            // Animación iconos
            iconOpen.classList.add('scale-0', 'opacity-0');
            iconClose.classList.remove('scale-0', 'opacity-0');
            iconClose.classList.add('scale-100');
            
            document.body.style.overflow = 'hidden'; // Bloquear scroll del cuerpo
        } else {
            // Cerrar menú
            mobileMenu.classList.remove('translate-x-0');
            mobileMenu.classList.add('-translate-x-full');
            
            // Animación iconos
            iconClose.classList.remove('scale-100');
            iconClose.classList.add('scale-0', 'opacity-0');
            iconOpen.classList.remove('scale-0', 'opacity-0');
            iconOpen.classList.add('scale-100');
            
            document.body.style.overflow = ''; // Reactivar scroll
        }
    }

    if(menuBtn){
        menuBtn.addEventListener('click', toggleMenu);
    }

    mobileLinks.forEach(link => {
        link.addEventListener('click', toggleMenu);
    });

    // === LÓGICA DE SCROLL (Hide/Show Nav) ===
    window.addEventListener('scroll', () => {
        const currentScrollY = window.scrollY;

        // 1. Si el menú móvil está abierto, NO ocultar la barra
        if (isMenuOpen) return;

        // 2. Determinar dirección del scroll
        // Si bajamos Y ya hemos bajado más de 50px (para evitar saltos arriba del todo)
        if (currentScrollY > lastScrollY && currentScrollY > 50) {
            // SCROLL DOWN -> Ocultar Nav
            // -translate-y-full mueve el elemento 100% de su altura hacia arriba
            if(nav) nav.classList.add('-translate-y-[80%]');
        } else {
            // SCROLL UP -> Mostrar Nav
            if(nav) nav.classList.remove('-translate-y-[80%]');
        }

        // Actualizar la última posición conocida
        lastScrollY = currentScrollY;
    });