import Link from "next/link";

const benefits = [
  {
    number: "01",
    title: "Local kitchens, one place",
    description:
      "Find restaurants and see what is available before you add it to your order.",
  },
  {
    number: "02",
    title: "One cart, grouped clearly",
    description:
      "Choose from more than one restaurant and review each kitchen's items separately.",
  },
  {
    number: "03",
    title: "Pickup, made simple",
    description:
      "Place your order online and pay the restaurant directly when you collect it.",
  },
];

export default function Home() {
  return (
    <main id="main-content">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Good food, closer to home</p>
          <h1>Make room for something delicious.</h1>
          <p className="hero-description">
            Find neighborhood restaurants, build your order, and pick it up
            fresh. No delivery guesswork, no online payment required.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/restaurants">
              Explore restaurants
              <span aria-hidden="true">→</span>
            </Link>
            <Link className="text-link" href="/cart">
              View your cart
            </Link>
          </div>
          <p className="hero-note">
            Pickup orders · Pay the restaurant directly
          </p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="plate">
            <span className="plate-sun" />
            <span className="plate-leaf plate-leaf-one" />
            <span className="plate-leaf plate-leaf-two" />
            <span className="plate-tomato" />
            <span className="plate-herb">✳</span>
          </div>
          <div className="art-label">
            <span className="art-label-icon">✦</span>
            <span>Made nearby</span>
          </div>
          <span className="art-spark art-spark-one">✳</span>
          <span className="art-spark art-spark-two">✦</span>
        </div>
      </section>

      <section className="how-it-works" aria-labelledby="how-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">The good part is easy</p>
            <h2 id="how-heading">A better kind of takeout.</h2>
          </div>
          <Link className="text-link" href="/restaurants">
            Find your next favorite <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="benefit-grid">
          {benefits.map((benefit) => (
            <article className="benefit-card" key={benefit.number}>
              <span className="benefit-number">{benefit.number}</span>
              <h3>{benefit.title}</h3>
              <p>{benefit.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="manager-cta" aria-labelledby="manager-heading">
        <div>
          <p className="eyebrow">For restaurant teams</p>
          <h2 id="manager-heading">Your kitchen belongs here, too.</h2>
          <p>
            Restaurant access is approved by the Snapfood team. Get in touch to
            manage your menu and pickup orders.
          </p>
        </div>
        <Link className="button button-light" href="/manager">
          Restaurant sign in
        </Link>
      </section>
    </main>
  );
}
