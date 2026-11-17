/* ==================================================================
   ARCHIVO: assets/js/paginas/inicio.js   (solo en index.html)
   1. Pone 4 productos de cada sección en la página de inicio.
   2. Carrusel: lista "slides" (textos, fotos y enlaces de cada diapositiva),
      cambio automático, pausa con el mouse y efecto de movimiento.
   ================================================================== */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    // Muestra de cada colección: 4 productos de su propia categoría (desde la base de datos).
    window.StoreReady.then(() => {
      document.querySelectorAll('[data-home-collection]').forEach((grid) => {
        const items = window.StoreProducts.byCategory(grid.dataset.homeCollection).slice(0, 4);
        window.StoreCart.renderCards(grid, items);
      });
    });

    const page = window.StoreCart.page;
    // Diapositivas del carrusel: para cambiar un texto o una foto, edítalo aquí (image = id de la foto en Unsplash)
    const slides = [
      { eyebrow: 'COLECCIÓN 2026 · CABALLERO', title: 'Jeans con<br>carácter.', copy: 'Buenos cortes para todos tus planes.', link: page('caballero.html'), cta: 'Ver colección caballero', image: 'photo-1617114919297-3c8ddb01f599' },
      { eyebrow: 'COLECCIÓN 2026 · DAMA', title: 'Tu forma.<br>Tu jean.', copy: 'Jeans pensados para ti, para todos los días.', link: page('dama.html'), cta: 'Ver colección dama', image: 'photo-1475178626620-a4d074967452' },
      { eyebrow: 'COLECCIÓN 2026 · NIÑOS', title: 'Pequeños estilos.<br>Grandes planes.', copy: 'Listos para el recreo, el paseo y todo lo que venga.', link: page('ninos.html'), cta: 'Ver colección niños', image: 'photo-1606841466616-795c2c8dec72' }
    ];
    const image = document.querySelector('[data-hero-image]');
    if (!image) return;
    const elements = {
      eyebrow: document.querySelector('[data-hero-eyebrow]'), title: document.querySelector('[data-hero-title]'),
      copy: document.querySelector('[data-hero-copy]'), link: document.querySelector('[data-hero-link]'),
      dots: document.querySelector('[data-hero-dots]'), number: document.querySelector('[data-hero-number]')
    };
    const hero = image.closest('.hero');
    const content = hero.querySelector('.hero-content');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let current = 0;

    // Muestra la diapositiva número "index": cambia foto, textos, enlace y punto activo
    function showSlide(index) {
      current = (index + slides.length) % slides.length;
      const slide = slides[current];
      image.style.backgroundImage = `url("https://images.unsplash.com/${slide.image}?auto=format&fit=crop&w=2000&q=90")`;
      elements.eyebrow.textContent = slide.eyebrow;
      elements.title.innerHTML = slide.title;
      elements.copy.textContent = slide.copy;
      elements.link.href = slide.link;
      elements.link.firstChild.textContent = `${slide.cta} `;
      elements.number.textContent = `0${current + 1} / 0${slides.length}`;
      elements.dots.querySelectorAll('button').forEach((dot, dotIndex) => {
        dot.classList.remove('selected');
        dot.setAttribute('aria-current', dotIndex === current ? 'true' : 'false');
      });
      // Reinicia las animaciones del texto, la imagen y la barra de progreso.
      [content, image].forEach((node) => { node.classList.remove('is-entering'); void node.offsetWidth; node.classList.add('is-entering'); });
      elements.dots.children[current].classList.add('selected');
    }

    elements.dots.innerHTML = slides.map((_, index) => `<button type="button" aria-label="Ir a diapositiva ${index + 1}" data-slide="${index}"></button>`).join('');
    elements.dots.querySelectorAll('[data-slide]').forEach((dot) => dot.addEventListener('click', () => showSlide(Number(dot.dataset.slide))));
    document.querySelector('[data-hero-prev]').addEventListener('click', () => showSlide(current - 1));
    document.querySelector('[data-hero-next]').addEventListener('click', () => showSlide(current + 1));

    // La barra de progreso del punto activo marca el tiempo: al terminar, pasa a la siguiente diapositiva.
    elements.dots.addEventListener('animationend', (event) => {
      if (!reducedMotion && event.target.classList.contains('selected')) showSlide(current + 1);
    });
    if (reducedMotion) hero.classList.add('is-static');

    // Pausa mientras el usuario mira o usa el carrusel, y cuando la pestaña no está visible.
    const setPaused = (value) => hero.classList.toggle('is-paused', value);
    hero.addEventListener('mouseenter', () => setPaused(true));
    hero.addEventListener('mouseleave', () => setPaused(false));
    hero.addEventListener('focusin', () => setPaused(true));
    hero.addEventListener('focusout', () => setPaused(false));
    document.addEventListener('visibilitychange', () => setPaused(document.hidden));

    // Efecto parallax suave del texto con el mouse.
    if (!reducedMotion && window.matchMedia('(pointer: fine)').matches) {
      hero.addEventListener('mousemove', (event) => {
        const rect = hero.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        hero.style.setProperty('--mx', x.toFixed(3));
        hero.style.setProperty('--my', y.toFixed(3));
      });
    }

    // Precarga las imágenes para evitar el parpadeo al cambiar de diapositiva.
    slides.forEach((slide) => { new Image().src = `https://images.unsplash.com/${slide.image}?auto=format&fit=crop&w=2000&q=90`; });
    showSlide(0);
  });
})();
