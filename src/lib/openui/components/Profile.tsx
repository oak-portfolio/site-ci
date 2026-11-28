import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { oakProfileBlockOn } from "@/lib/oakFlags/profile";
import { ClaimList } from "../cards";
import { oakLazyView } from "../figure/oakLazyView";
import { claimId, SkelBar } from "../scope";

export type ProfileProps = { claim: string; size?: "brief" | "full" };

export function ProfileGhost() {
  return <div className="oak-profile oak-openui-skel" data-pending="" aria-hidden="true">
    <span className="oak-profile__head"><span className="oak-profile__art oak-openui-card__thumb" /><span className="oak-openui-card__bars"><SkelBar size="short" /><SkelBar size="long" /></span></span>
    <span className="oak-profile__facts">{[0, 1, 2, 3].map(index => <span key={index} className="oak-profile__fact"><SkelBar size="short" /><SkelBar /></span>)}</span>
  </div>;
}

const ProfileOff = ({ claim }: ProfileProps) => <ClaimList ids={[claim]} />;
const Lazy = oakLazyView<ProfileProps>(() => import("./ProfileView"), ProfileGhost, ProfileOff);
const ProfileBlock = ({ claim, size }: ProfileProps) => oakProfileBlockOn() ? <Lazy claim={claim} size={size} /> : <ProfileOff claim={claim} />;

export const Profile = defineComponent({
  name: "Profile",
  description: "Only when the visitor asks who Steve is or for a summary of him: his portrait, hero title and profile facts as one card. size brief (default) or full (adds his hero paragraph and what he knows about). Never for questions about a project, a role or how something was built.",
  props: z.object({ claim: claimId, size: z.enum(["brief", "full"]).optional() }),
  component: ({ props }) => <ProfileBlock claim={props.claim} size={props.size} />,
});
