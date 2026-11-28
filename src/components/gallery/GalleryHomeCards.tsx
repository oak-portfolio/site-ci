import { Icon } from "@/components/ui/Icon";
import { galleryHomeCards, galleryReplays } from "@/data/galleryReplays";
import "./gallery.css";

/** Ticket 50: the Ask home's six gallery cards, each opening its replay on /gallery. */
export default function GalleryHomeCards() {
  const cards = galleryHomeCards.flatMap(id => galleryReplays.filter(replay => replay.id === id));
  return <nav className="gallery-home" aria-label="See what Oak can show you">
    <ul className="gallery-home__grid">
      {cards.map(replay => <li key={replay.id}>
        <a className="gallery-home__card" data-candy-tile data-tone={replay.tone} href={`/gallery#${replay.id}`}>
          <span className="gallery-home__kind">{replay.label}</span>
          <span className="gallery-home__question">{replay.question}</span>
          <span className="gallery-home__play" aria-hidden="true"><Icon name="play" size={14} /></span>
        </a>
      </li>)}
    </ul>
  </nav>;
}
