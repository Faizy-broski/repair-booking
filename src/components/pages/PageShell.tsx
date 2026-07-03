import Nav from "@/components/landing/nav";
import Footer from "@/components/landing/footer";

export default function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="relative overflow-x-hidden bg-gradient-to-b from-[#eafafa] via-[#f4fbfb] to-white pt-[96px] sm:pt-[104px] lg:pt-[116px]">
        <div className="absolute inset-x-0 top-0 -z-10 flex justify-center">
          <div className="h-[300px] w-[92vw] max-w-[900px] rounded-full bg-cyan-300/30 blur-[120px] sm:h-[550px] sm:blur-[180px]" />
        </div>
        <div className="absolute left-1/2 top-24 -translate-x-1/2 -z-10">
          <div className="h-[250px] w-[80vw] max-w-[700px] rounded-full bg-teal-300/20 blur-[90px] sm:h-[450px] sm:blur-[140px]" />
        </div>

        <Nav />
        {children}
      </div>
      <Footer />
    </>
  );
}
