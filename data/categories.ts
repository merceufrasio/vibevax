import { Colors } from "@/constants/Colors";
import type { HomeSection, MovieCategory } from "@/types/movie";

export const interestCategories: MovieCategory[] = [
  {
    id: "marvel",
    title: "Marvel",
    subtitle: "Siêu anh hùng và multiverse",
    colors: Colors.collectionGradients.marvel,
  },
  {
    id: "dc-comic",
    title: "DC Comic",
    subtitle: "Bóng tối, phản anh hùng, sử thi",
    colors: Colors.collectionGradients["dc-comic"],
  },
  {
    id: "chau-tinh-tri",
    title: "Châu Tinh Trì",
    subtitle: "Hài quái, duyên lạ, kinh điển",
    colors: Colors.collectionGradients["chau-tinh-tri"],
  },
  {
    id: "doraemon",
    title: "Doraemon",
    subtitle: "Gia đình, hoài niệm, phiêu lưu",
    colors: Colors.collectionGradients.doraemon,
  },
  {
    id: "keo-ly",
    title: "Keo Lỳ Slayyy",
    subtitle: "Chất riêng, nổi loạn, sáng bóng",
    colors: Colors.collectionGradients["keo-ly"],
  },
  {
    id: "anime",
    title: "Anime",
    subtitle: "Neon, cảm xúc, thế giới khác",
    colors: Colors.collectionGradients.anime,
  },
];

export const homeSections: HomeSection[] = [
  { id: "cn-latest", titleKey: "sections.cn", region: "cn" },
  { id: "usuk-latest", titleKey: "sections.usuk", region: "usuk" },
  { id: "kr-latest", titleKey: "sections.kr", region: "kr" },
];

