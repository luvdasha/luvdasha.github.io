/* ==========================================================================
   ПИСЬМО ДЛЯ ТЕБЯ — сценарий открытки
   --------------------------------------------------------------------------
   Вся анимация привязана к прогрессу прокрутки и плавно откатывается назад.
   Чтобы изменить сценарий, настройте числа в TIMELINE ниже:
   каждое значение — [начало, конец] в диапазоне от 0 до 1.
   ========================================================================== */

(() => {
  'use strict';

  /* ------------------------------------------------------------------------
     1. ТАЙМИНГ СЦЕНАРИЯ
     ------------------------------------------------------------------------ */
  const TIMELINE = {
    seal: [0.015, 0.145],   // печать «отпускает» конверт
    flap: [0.055, 0.325],   // клапан поворачивается в 3D
    rise: [0.225, 0.600],   // бумажка выезжает вверх
    focus: [0.500, 0.770],  // конверт отступает, письмо выходит на первый план
    text: [0.510, 0.900],   // появление строк письма
    hint: [0.000, 0.085],   // исчезновение подсказки
    intro: [0.000, 0.100],  // исчезновение заголовка
  };

  const REVEAL_STAGGER = 0.040; // максимальная задержка между строками письма
  const REVEAL_DURATION = 0.145;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------------
     2. ЭЛЕМЕНТЫ И СОСТОЯНИЕ
     ------------------------------------------------------------------------ */
  const dom = {
    story: document.getElementById('story'),
    stage: document.getElementById('stage'),
    scene: document.getElementById('scene'),
    letter: document.getElementById('letter'),
    letterClip: document.getElementById('letterClip'),
    seal: document.getElementById('seal'),
    scrollHint: document.getElementById('scrollHint'),
    progress: document.getElementById('progressBar'),
    particles: document.getElementById('particles'),
    burst: document.getElementById('sealBurst'),
    outro: document.getElementById('outro'),
    replay: document.getElementById('replay'),
  };

  if (!dom.story || !dom.stage || !dom.scene || !dom.letter) {
    return;
  }

  const revealItems = Array.from(dom.letter.querySelectorAll('[data-reveal]'));

  const state = {
    target: 0,
    current: 0,
    rafId: 0,
    lastTime: 0,
    flapOpen: false,
    lifted: false,
    reading: false,
    sealHidden: false,
    hintHidden: false,
    burstDone: false,
    burstTimer: 0,
    focusTimer: 0,
    measured: false,
  };

  // Геометрия, рассчитанная один раз при изменении размера.
  const geometry = {
    envHeight: 0,
    letterHeight: 0,
    baseTop: 0,
    fitScale: 1,
    riseLift: 0,
    focusAdjust: 0,
  };

  /* ------------------------------------------------------------------------
     3. МАТЕМАТИКА
     ------------------------------------------------------------------------ */
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const smoothstep = (value) => {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };

  // Возвращает плавно сглаженный прогресс внутри отрезка [from, to].
  const segment = (progress, from, to) => {
    if (to <= from) return progress >= to ? 1 : 0;
    return smoothstep((progress - from) / (to - from));
  };

  /* ------------------------------------------------------------------------
     4. ГЕНЕРАЦИЯ ЛЕТЯЩИХ ЧАСТИЦ
     ------------------------------------------------------------------------ */
  function createParticles() {
    if (!dom.particles) return;
    dom.particles.replaceChildren();

    if (reduceMotion) return;

    const mobile = window.matchMedia('(max-width: 680px)').matches;
    const count = mobile ? 18 : 30;
    const types = ['heart', 'star', 'petal'];
    const colors = ['#f3b6c2', '#ffd3bd', '#f0c98f', '#e999ad', '#ffe4d0', '#dca1bd'];

    const random = (min, max) => min + Math.random() * (max - min);

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < count; i += 1) {
      const type = types[Math.floor(Math.random() * types.length)];
      const size =
        type === 'star'
          ? random(4, 9)
          : type === 'petal'
            ? random(5, 11)
            : random(7, 15);

      const duration = random(mobile ? 22 : 26, mobile ? 40 : 52);
      const delay = -random(0, duration);
      const drift = random(-8, 8);
      const spin = random(-150, 150);
      const alpha = random(0.32, 0.8);

      const particle = document.createElement('span');
      particle.className = `particle particle--${type}`;
      particle.style.setProperty('--x', `${random(2, 98)}vw`);
      particle.style.setProperty('--size', `${size.toFixed(2)}px`);
      particle.style.setProperty('--dur', `${duration.toFixed(2)}s`);
      particle.style.setProperty('--delay', `${delay.toFixed(2)}s`);
      particle.style.setProperty('--drift', `${drift.toFixed(2)}vw`);
      particle.style.setProperty('--spin', `${spin.toFixed(1)}deg`);
      particle.style.setProperty('--alpha', alpha.toFixed(2));
      particle.style.setProperty('--color', colors[Math.floor(Math.random() * colors.length)]);
      particle.style.setProperty('--sway-dur', `${random(4.5, 8.5).toFixed(2)}s`);
      particle.style.setProperty('--sway-delay', `${(-random(0, 4)).toFixed(2)}s`);
      particle.style.setProperty('--twinkle-dur', `${random(2.4, 5).toFixed(2)}s`);
      particle.style.setProperty('--twinkle-delay', `${(-random(0, 4)).toFixed(2)}s`);

      const inner = document.createElement('span');
      inner.className = 'particle__inner';

      if (type === 'petal') {
        inner.setAttribute('aria-hidden', 'true');
      } else {
        const symbol = type === 'heart' ? '#icon-heart' : '#icon-sparkle';
        inner.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="${symbol}"></use></svg>`;
      }

      particle.appendChild(inner);
      fragment.appendChild(particle);
    }

    dom.particles.appendChild(fragment);
  }

  /* ------------------------------------------------------------------------
     4.1. ИСКРЫ В МОМЕНТ ОТКРЫТИЯ ПЕЧАТИ
     ------------------------------------------------------------------------ */
  function createSealBurst() {
    if (!dom.burst || reduceMotion) return;

    const mobile = window.matchMedia('(max-width: 680px)').matches;
    const count = mobile ? 14 : 18;
    const maxDistance = mobile ? 98 : 132;
    const colors = ['#fff1cc', '#ffd17f', '#ffbccb', '#f7a8c0', '#ffe6b0', '#d9819e'];

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
      const distance = 28 + Math.random() * (maxDistance - 28);
      const spark = document.createElement('span');
      const symbol = Math.random() > 0.45 ? '#icon-heart' : '#icon-sparkle';

      spark.className = 'scene__burst-spark';
      spark.style.setProperty('--size', `${(6 + Math.random() * 7).toFixed(1)}px`);
      spark.style.setProperty('--spark-color', colors[Math.floor(Math.random() * colors.length)]);
      spark.style.setProperty('--spark-x', `${(Math.cos(angle) * distance).toFixed(1)}px`);
      spark.style.setProperty('--spark-y', `${(Math.sin(angle) * distance - 6).toFixed(1)}px`);
      spark.style.setProperty('--spark-rotate', `${(Math.random() * 160 - 80).toFixed(1)}deg`);
      spark.style.setProperty('--spark-scale', (0.8 + Math.random() * 0.5).toFixed(2));
      spark.style.setProperty('--spark-opacity', (0.82 + Math.random() * 0.18).toFixed(2));
      spark.style.setProperty('--spark-delay', `${(Math.random() * 0.13).toFixed(2)}s`);
      spark.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="${symbol}"></use></svg>`;

      fragment.appendChild(spark);
    }

    dom.burst.appendChild(fragment);
  }

  function fireSealBurst() {
    if (!dom.burst) return;

    // Перезапуск CSS-анимации, если печать «отпускают» повторно.
    dom.scene.classList.remove('is-bursting');
    void dom.scene.offsetWidth;
    dom.scene.classList.add('is-bursting');

    window.clearTimeout(state.burstTimer);
    state.burstTimer = window.setTimeout(() => {
      dom.scene.classList.remove('is-bursting');
    }, 1400);
  }

  /* ------------------------------------------------------------------------
     5. ИЗМЕРЕНИЕ ГЕОМЕТРИИ
     ------------------------------------------------------------------------ */
  function measure() {
    const viewportHeight = window.innerHeight;
    const envHeight = dom.scene.offsetHeight;
    const letterHeight = dom.letter.offsetHeight;

    if (!envHeight || !letterHeight) return;

    geometry.envHeight = envHeight;
    geometry.letterHeight = letterHeight;

    // Положение сцены внутри sticky-экрана. offsetTop не зависит от анимаций.
    geometry.baseTop = dom.scene.offsetTop + envHeight * 0.07;

    // Насколько крупно письмо может раскрыться, чтобы поместиться по высоте.
    const availableHeight = Math.max(220, viewportHeight - Math.max(48, viewportHeight * 0.12));
    geometry.fitScale = clamp(availableHeight / letterHeight, 0.72, 1.04);

    // В финале письмо стоит по центру экрана с небольшим воздухом сверху.
    const centeredTop = (viewportHeight - letterHeight * geometry.fitScale) / 2 - 8;
    const finalTop = Math.max(24, centeredTop);

    // y-смещение бумажки, при котором её верх окажется в finalTop.
    const finalY = finalTop - geometry.baseTop;

    // Насколько высоко бумажка поднимается из конверта до фазы focus.
    // В альбомной ориентации экран ниже, поэтому подъём мягче.
    const landscapeShort = window.matchMedia('(orientation: landscape) and (max-height: 560px)').matches;
    geometry.riseLift = landscapeShort
      ? Math.min(envHeight * 0.72, letterHeight * 0.30)
      : Math.min(envHeight * 1.05, letterHeight * 0.38);

    // Добавка на фазе focus: в конце движения получаем ровно finalY.
    geometry.focusAdjust = finalY + geometry.riseLift;

    state.measured = true;
  }

  /* ------------------------------------------------------------------------
     6. ПРИМЕНЕНИЕ ПРОГРЕССА
     ------------------------------------------------------------------------ */
  function apply(progress) {
    if (!state.measured) return;

    const p = clamp(progress, 0, 1);

    const seal = segment(p, ...TIMELINE.seal);
    const open = segment(p, ...TIMELINE.flap);
    const rise = segment(p, ...TIMELINE.rise);
    const focus = segment(p, ...TIMELINE.focus);
    const introFade = segment(p, ...TIMELINE.intro);
    const hintFade = segment(p, ...TIMELINE.hint);

    // Одноразовый «взрыв» искр в момент, когда печать отпускает конверт.
    if (seal > 0.58 && !state.burstDone) {
      state.burstDone = true;
      fireSealBurst();
    } else if (seal < 0.04 && state.burstDone) {
      state.burstDone = false;
      dom.scene.classList.remove('is-bursting');
      window.clearTimeout(state.burstTimer);
    }

    // --- Основные переменные сцены ---------------------------------------
    dom.scene.style.setProperty('--open', open.toFixed(4));
    dom.scene.style.setProperty('--rise', rise.toFixed(4));
    dom.scene.style.setProperty('--focus', focus.toFixed(4));
    dom.scene.style.setProperty('--seal', seal.toFixed(4));

    // Конверт мягко опускается и чуть уменьшается, уступая письму сцену.
    const envShift = focus * Math.min(86, window.innerHeight * 0.085);
    dom.scene.style.setProperty('--env-y', `${envShift.toFixed(2)}px`);
    dom.scene.style.setProperty('--env-scale', (1 - focus * 0.075).toFixed(4));

    // --- Движение бумажки ------------------------------------------------
    // Небольшой «перелёт» вверх и мягкое возвращение создают ощущение,
    // будто лист вытянули из конверта и он опустился в руку.
    const paperY = -geometry.riseLift * rise + geometry.focusAdjust * focus;
    const paperRotation = -1.7 * rise + 1.0 * focus;
    const paperScale = 0.94 + (geometry.fitScale - 0.94) * rise;
    const paperOpacity = clamp((rise - 0.015) / 0.08, 0, 1);

    dom.scene.style.setProperty('--paper-y', `${paperY.toFixed(2)}px`);
    dom.scene.style.setProperty('--paper-rot', `${paperRotation.toFixed(3)}deg`);
    dom.scene.style.setProperty('--paper-scale', paperScale.toFixed(4));
    dom.scene.style.setProperty('--paper-opacity', paperOpacity.toFixed(3));

    // --- Заголовок и подсказка -------------------------------------------
    dom.stage.style.setProperty('--intro-opacity', (1 - introFade).toFixed(3));
    dom.stage.style.setProperty('--intro-y', `${(-20 * introFade).toFixed(2)}px`);
    dom.stage.style.setProperty('--hint-opacity', (1 - hintFade).toFixed(3));
    dom.stage.style.setProperty('--hint-y', `${(12 * hintFade).toFixed(2)}px`);
    dom.stage.style.setProperty('--progress', p.toFixed(4));

    // --- Появление строк письма -----------------------------------------
    // Шаг адаптируется под количество абзацев: если текста больше,
    // все строки всё равно успеют появиться до конца сценария.
    const revealSpan = Math.max(
      0,
      TIMELINE.text[1] - TIMELINE.text[0] - REVEAL_DURATION
    );
    const revealStep = Math.min(
      REVEAL_STAGGER,
      revealSpan / Math.max(1, revealItems.length - 1)
    );

    revealItems.forEach((item, index) => {
      const start = TIMELINE.text[0] + index * revealStep;
      const end = start + REVEAL_DURATION;
      const reveal = segment(p, start, end);

      item.style.opacity = reveal.toFixed(3);
      item.style.transform = `translate3d(0, ${((1 - reveal) * 18).toFixed(2)}px, 0)`;
    });

    // --- Классы для смены слоёв и интерактивности ------------------------
    const flapOpen = open > 0.5;
    if (flapOpen !== state.flapOpen) {
      state.flapOpen = flapOpen;
      dom.scene.classList.toggle('is-flap-open', flapOpen);
    }

    const lifted = p > 0.655;
    if (lifted !== state.lifted) {
      state.lifted = lifted;
      dom.scene.classList.toggle('is-lifted', lifted);
    }

    const reading = p > 0.80;
    if (reading !== state.reading) {
      state.reading = reading;
      dom.scene.classList.toggle('is-reading', reading);
    }

    // Скрываем печать из tab-порядка, когда она растворилась.
    const sealHidden = seal > 0.92;
    if (sealHidden !== state.sealHidden) {
      state.sealHidden = sealHidden;
      dom.seal.disabled = sealHidden;
      dom.seal.tabIndex = sealHidden ? -1 : 0;
      dom.seal.setAttribute('aria-hidden', String(sealHidden));
    }

    // Подсказка исчезает сразу после начала прокрутки.
    const hintHidden = p > TIMELINE.hint[1];
    if (hintHidden !== state.hintHidden) {
      state.hintHidden = hintHidden;
      dom.scrollHint.disabled = hintHidden;
      dom.scrollHint.tabIndex = hintHidden ? -1 : 0;
      dom.scrollHint.setAttribute('aria-hidden', String(hintHidden));
      dom.scrollHint.style.pointerEvents = hintHidden ? 'none' : '';
    }

    // Тонкий прогресс внизу экрана.
    dom.progress.style.setProperty('--progress', p.toFixed(4));
  }

  /* ------------------------------------------------------------------------
     7. ПЛАВНОЕ ДОГОНЯЮЩЕЕ ДВИЖЕНИЕ
     ------------------------------------------------------------------------ */
  function getScrollProgress() {
    const rect = dom.story.getBoundingClientRect();
    const range = rect.height - window.innerHeight;
    if (range <= 0) return 0;
    return clamp(-rect.top / range, 0, 1);
  }

  function tick(time) {
    if (!state.lastTime) state.lastTime = time;
    const delta = Math.min(48, time - state.lastTime) / 1000;
    state.lastTime = time;

    const difference = state.target - state.current;

    if (reduceMotion || Math.abs(difference) < 0.00045) {
      state.current = state.target;
      apply(state.current);
      state.rafId = 0;
      state.lastTime = 0;
      return;
    }

    // Экспоненциальное сглаживание не зависит от частоты кадров.
    const easing = 1 - Math.exp(-delta * 9.5);
    state.current += difference * easing;
    apply(state.current);

    state.rafId = requestAnimationFrame(tick);
  }

  function scheduleUpdate() {
    state.target = getScrollProgress();

    if (!state.rafId) {
      state.lastTime = 0;
      state.rafId = requestAnimationFrame(tick);
    }
  }

  function remeasureAndSync() {
    measure();
    state.target = getScrollProgress();

    // Не «телепортируем» сцену при повороте экрана или изменении высоты
    // мобильной адресной строки — плавно догоняем новое положение.
    if (!state.rafId) {
      state.lastTime = 0;
      state.rafId = requestAnimationFrame(tick);
    }
  }

  /* ------------------------------------------------------------------------
     8. ИНТЕРАКЦИЯ
     ------------------------------------------------------------------------ */

  // Плавно прокручивает к моменту, когда письмо уже раскрыто.
  function scrollToLetter() {
    const storyTop = window.scrollY + dom.story.getBoundingClientRect().top;
    const scrollRange = dom.story.offsetHeight - window.innerHeight;
    const destination = storyTop + scrollRange * 0.82;

    window.scrollTo({
      top: Math.max(0, destination),
      behavior: reduceMotion ? 'auto' : 'smooth',
    });

    // Переводим фокус на письмо, чтобы им было удобно пользоваться
    // с клавиатуры и скринридера.
    window.clearTimeout(state.focusTimer);
    state.focusTimer = window.setTimeout(() => {
      dom.letter.focus({ preventScroll: true });
    }, reduceMotion ? 80 : 900);
  }

  // Клик по конверту или печати запускает сценарий.
  dom.scene.addEventListener('click', () => {
    if (state.current < 0.78) scrollToLetter();
  });

  // Подсказка внизу — обычная кнопка.
  dom.scrollHint.addEventListener('click', scrollToLetter);

  // «Прочитать ещё раз» возвращает к закрытому конверту.
  dom.replay.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });

    window.clearTimeout(state.focusTimer);
    state.focusTimer = window.setTimeout(() => {
      dom.seal.focus({ preventScroll: true });
    }, reduceMotion ? 80 : 900);
  });

  /* ------------------------------------------------------------------------
     9. НАБЛЮДАТЕЛЬ ЗА ФИНАЛЬНОЙ СЕКЦИЕЙ
     ------------------------------------------------------------------------ */
  function initOutroObserver() {
    if (!dom.outro) return;

    if (!('IntersectionObserver' in window)) {
      dom.outro.classList.add('is-visible');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            dom.outro.classList.add('is-visible');
            observer.disconnect();
          }
        });
      },
      { threshold: 0.28 }
    );

    observer.observe(dom.outro);
  }

  /* ------------------------------------------------------------------------
     10. СТАРТ И СЛУШАТЕЛИ СОБЫТИЙ
     ------------------------------------------------------------------------ */
  function init() {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    createParticles();
    createSealBurst();
    measure();
    state.target = getScrollProgress();
    state.current = state.target;
    apply(state.current);
    initOutroObserver();

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', remeasureAndSync, { passive: true });
    window.addEventListener('orientationchange', () => {
      window.setTimeout(remeasureAndSync, 160);
    });

    if ('ResizeObserver' in window) {
      const resizeObserver = new ResizeObserver(() => {
        // Пересчитываем только при реальном изменении размеров.
        const nextHeight = dom.letter.offsetHeight;
        if (Math.abs(nextHeight - geometry.letterHeight) > 1) {
          remeasureAndSync();
        }
      });
      resizeObserver.observe(dom.letter);
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(remeasureAndSync).catch(() => {});
    }

    // Небольшая страховка для мобильных браузеров, меняющих высоту
    // из-за адресной строки.
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', remeasureAndSync, { passive: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

/* ==========================================================================
   СЕКЦИЯ «УТРЕННИЙ ЛУГ»
   --------------------------------------------------------------------------
   Здесь три независимых сценария:
   1) IntersectionObserver добавляет .is-revealed — CSS сам разыгрывает
      каскад благодаря переменной --reveal-delay у каждого элемента.
   2) requestAnimationFrame двигает три слоя травы с разной глубиной.
      Параллакс считается от положения секции во вьюпорте.
   3) Небольшие «светлячки» создаются в JS и оживают только в кадре.
   ========================================================================== */
(() => {
  'use strict';

  const meadow = document.getElementById('meadow');
  if (!meadow) return;

  const intro = meadow.querySelector('.meadow__intro');
  const letter = meadow.querySelector('.meadow__letter');
  const motesContainer = document.getElementById('meadowMotes');
  const revealItems = Array.from(meadow.querySelectorAll('[data-meadow-reveal]'));
  const grassLayers = Array.from(meadow.querySelectorAll('[data-grass-depth]'));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------------
     1. Каскадное появление
     ------------------------------------------------------------------------ */
  revealItems.forEach((item, index) => {
    // Небольшая задержка нарастает от первого элемента к последнему.
    item.style.setProperty('--reveal-delay', `${(index * 0.075).toFixed(3)}s`);
  });

  function revealMeadow() {
    meadow.classList.add('is-revealed');
  }

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          revealMeadow();
          observer.disconnect();
        }
      },
      {
        threshold: 0.18,
        rootMargin: '0px 0px -12% 0px',
      }
    );

    if (intro) revealObserver.observe(intro);
    if (letter) revealObserver.observe(letter);
  } else {
    revealMeadow();
  }

  /* ------------------------------------------------------------------------
     2. Светящиеся точки над травой
     ------------------------------------------------------------------------ */
  function createMotes() {
    if (!motesContainer || reduceMotion) return;

    const isMobile = window.matchMedia('(max-width: 620px)').matches;
    const count = isMobile ? 9 : 14;
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < count; i += 1) {
      const mote = document.createElement('span');
      mote.className = 'meadow__mote';
      mote.style.setProperty('--mote-x', `${(6 + Math.random() * 88).toFixed(2)}%`);
      mote.style.setProperty('--mote-y', `${(28 + Math.random() * 52).toFixed(2)}%`);
      mote.style.setProperty('--mote-size', `${(1.5 + Math.random() * 2.8).toFixed(1)}px`);
      mote.style.setProperty('--mote-duration', `${(12 + Math.random() * 13).toFixed(1)}s`);
      mote.style.setProperty('--mote-delay', `${(-Math.random() * 25).toFixed(1)}s`);
      mote.style.setProperty('--mote-drift', `${(-24 + Math.random() * 48).toFixed(1)}px`);
      mote.style.setProperty('--mote-alpha', `${(0.28 + Math.random() * 0.42).toFixed(2)}`);
      fragment.appendChild(mote);
    }

    motesContainer.appendChild(fragment);
  }

  /* ------------------------------------------------------------------------
     3. Параллакс травы
     ------------------------------------------------------------------------ */
  let isActive = false;
  let rafId = 0;

  function updateParallax() {
    rafId = 0;
    if (!isActive || reduceMotion) return;

    const rect = meadow.getBoundingClientRect();
    const viewport = window.innerHeight || document.documentElement.clientHeight;
    const travel = viewport + rect.height;
    if (travel <= 0) return;

    // 0 — секция только показалась снизу, 1 — уже уходит вверх.
    const progress = Math.min(1, Math.max(0, (viewport - rect.top) / travel));
    const center = progress - 0.5;

    grassLayers.forEach((layer) => {
      const depth = Number.parseFloat(layer.dataset.grassDepth) || 0.5;
      // Передняя трава смещается сильнее, дальняя — почти стоит.
      const shift = center * depth * -120;
      layer.style.transform = `translate3d(0, ${shift.toFixed(2)}px, 0)`;
    });
  }

  function scheduleParallax() {
    if (!isActive || reduceMotion || rafId) return;
    rafId = requestAnimationFrame(updateParallax);
  }

  // Включаем фоновые CSS-анимации и параллакс только рядом с секцией.
  if ('IntersectionObserver' in window) {
    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isActive = entry.isIntersecting;
          meadow.classList.toggle('is-in-view', isActive);
          if (isActive) scheduleParallax();
        });
      },
      { rootMargin: '20% 0px 20% 0px', threshold: 0 }
    );

    visibilityObserver.observe(meadow);
  } else {
    isActive = true;
    meadow.classList.add('is-in-view');
    scheduleParallax();
  }

  if (!reduceMotion) {
    window.addEventListener('scroll', scheduleParallax, { passive: true });
    window.addEventListener('resize', scheduleParallax, { passive: true });
  }

  createMotes();
  scheduleParallax();
})();
