// ===== FreshAlert — landing.js =====

document.addEventListener('DOMContentLoaded', () => {

    // 1. Parallax Effect for 3D Floating Elements
    const heroSection = document.querySelector('.hero-section');
    const floatingItems = document.querySelectorAll('.floating-item');

    if (heroSection && floatingItems.length > 0) {
        heroSection.addEventListener('mousemove', (e) => {
            const xAxis = (window.innerWidth / 2 - e.pageX) / 25;
            const yAxis = (window.innerHeight / 2 - e.pageY) / 25;

            // Apply slight transform based on mouse position to simulate 3D depth
            floatingItems.forEach((item, index) => {
                // Vary the intensity based on index to create depth layers
                const intensity = (index + 1) * 0.5;
                item.style.transform = `translate(${xAxis * intensity}px, ${yAxis * intensity}px)`;
            });
        });

        // Reset transform on mouse leave to allow CSS animations to resume naturally
        heroSection.addEventListener('mouseleave', () => {
            floatingItems.forEach(item => {
                item.style.transform = 'translate(0px, 0px)';
            });
        });
    }

    // 2. Intersection Observer for Scroll Animations
    // Add 'reveal' class to items we want to animate on scroll
    const revealElements = document.querySelectorAll('.feature-card, .step-card, .demo-card, .section-header');

    revealElements.forEach(el => {
        el.classList.add('reveal');
    });

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                // Optional: stop observing once revealed
                observer.unobserve(entry.target);
            }
        });
    }, {
        root: null,
        threshold: 0.15, // Trigger when 15% of the element is visible
        rootMargin: "0px 0px -50px 0px"
    });

    revealElements.forEach(el => {
        revealObserver.observe(el);
    });

    // 3. Simple Mock Navigation Handlers bridging to Dashbaord
    // Since we don't have real login/signup pages built in this request, 
    // we fallback to routing to dashbaord.html if the login/signup fails or we just want to proceed.

    // We can attach fallback logic to the buttons if login.html doesn't exist
    const ctaButtons = document.querySelectorAll('button');
    ctaButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const onclickAttr = btn.getAttribute('onclick');
            if (onclickAttr) {
                // The onclick is handled by HTML, but we can intercept or let it pass.
                // Doing nothing here lets the inline onclick="window.location.href='...'" run.
            }
        });
    });
});
