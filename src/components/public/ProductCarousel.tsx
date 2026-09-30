import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type ProductSlide = {
  src: string
  product: 'Tirzena' | 'Retrazin'
  alt: string
  treatment: 'cutout' | 'portrait'
}

const productSlides: ProductSlide[] = [
  {
    src: '/integral/assets/tirzena-product-hand.png',
    product: 'Tirzena',
    alt: 'Embalagem Tirzena apresentada em uma mão',
    treatment: 'cutout',
  },
  {
    src: '/integral/assets/carousel/tirzena-37.jpg',
    product: 'Tirzena',
    alt: 'Frasco Tirzena apresentado próximo ao rosto de uma modelo',
    treatment: 'portrait',
  },
  {
    src: '/integral/assets/carousel/tirzena-01.jpg',
    product: 'Tirzena',
    alt: 'Embalagem Tirzena em composição de estúdio',
    treatment: 'portrait',
  },
  {
    src: '/integral/assets/carousel/retrazin-39.jpg',
    product: 'Retrazin',
    alt: 'Embalagem Retrazin apresentada em uma mão',
    treatment: 'portrait',
  },
  {
    src: '/integral/assets/carousel/retrazin-42.jpg',
    product: 'Retrazin',
    alt: 'Embalagem e frascos Retrazin sobre tecido azul',
    treatment: 'portrait',
  },
  {
    src: '/integral/assets/carousel/retrazin-44.jpg',
    product: 'Retrazin',
    alt: 'Frasco Retrazin em composição de laboratório',
    treatment: 'portrait',
  },
]

export function ProductCarousel() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    if (isPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % productSlides.length)
    }, 5000)

    return () => window.clearInterval(interval)
  }, [isPaused])

  function move(direction: -1 | 1) {
    setActiveIndex((current) => (current + direction + productSlides.length) % productSlides.length)
  }

  return (
    <section
      className="product-carousel"
      aria-roledescription="carrossel"
      aria-label="Produtos Tirzena e Retrazin"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsPaused(false)
      }}
    >
      <div className="product-stage__glow" aria-hidden="true" />
      <div className="product-carousel__viewport" aria-live="polite">
        {productSlides.map((slide, index) => (
          <figure
            className={`product-carousel__slide product-carousel__slide--${slide.treatment} ${index === activeIndex ? 'is-active' : ''}`}
            aria-hidden={index !== activeIndex}
            key={slide.src}
          >
            <img src={slide.src} alt={index === activeIndex ? slide.alt : ''} loading={index === 0 ? 'eager' : 'lazy'} />
            <figcaption>{slide.product}</figcaption>
          </figure>
        ))}
      </div>

      <button className="product-carousel__arrow product-carousel__arrow--previous" type="button" onClick={() => move(-1)} aria-label="Imagem anterior">
        <ChevronLeft aria-hidden="true" />
      </button>
      <button className="product-carousel__arrow product-carousel__arrow--next" type="button" onClick={() => move(1)} aria-label="Próxima imagem">
        <ChevronRight aria-hidden="true" />
      </button>

      <div className="product-carousel__dots" aria-label="Escolher imagem do produto">
        {productSlides.map((slide, index) => (
          <button
            className={index === activeIndex ? 'is-active' : ''}
            type="button"
            onClick={() => setActiveIndex(index)}
            aria-label={`Mostrar ${slide.product}, imagem ${index + 1} de ${productSlides.length}`}
            aria-current={index === activeIndex ? 'true' : undefined}
            key={slide.src}
          />
        ))}
      </div>
    </section>
  )
}
