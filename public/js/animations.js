document.addEventListener('DOMContentLoaded', () => {
    /* ── Intersection Observer for Reveal Animations ── */
    const revealCallback = (entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('js-reveal--visible');
                observer.unobserve(entry.target);
            }
        });
    };

    const revealObserver = new IntersectionObserver(revealCallback, {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
    });

    document.querySelectorAll('.js-reveal').forEach(el => {
        revealObserver.observe(el);
    });

    /* ── Scroll Effect for Header ── */
    const header = document.querySelector('.app-header');
    if (header) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                header.classList.add('app-header--scrolled');
            } else {
                header.classList.remove('app-header--scrolled');
            }
        });
    }
});
