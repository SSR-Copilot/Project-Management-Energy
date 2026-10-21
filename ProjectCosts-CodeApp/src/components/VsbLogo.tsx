import logo from "../assets/vsb-logo.png";

/**
 * Original Canvas media asset (`ProjectDocs/_extracted/msapp/projectcosts/Assets/Images/
 * 78f7c930-cbb1-490d-a6c0-98d2452eee27.png`, byte-identical copy); size specifies its height.
 */
export function VsbLogo({ size = 60 }: { size?: number }) {
  return <img src={logo} height={size} width={size * 108 / 134} alt="VSB Cloud" />;
}
